/*
---
description: MavSuggest is an autocomplete (or text suggestion) mootools library which is able to query it's results from a server-side script, or a local cache of JSON objects.

license: MIT-style

authors:
- Dustin Hansen

requires:
- core/1.2.4: '*'

provides: [MavSuggest, MavSuggest.Request, MavSuggest.Request.JSON, String.strip_tags]

...
*/

var MavSuggest = new Class({
	Implements: [Options, Events],
	options: {
		allowDupes: true,							// true to allow duplicate selections, false to prevent
		append: null,								// element to 'append' selected item's HTML to.
		autoClear: false,							// automatically clear element when option is chosen
		autoTrim: true,								// strips leading and trailing whitespace from value in this.element
		class_name: 'suggest-opts',					// default class for menu
		disable: false,								// whether the menu is temporarily disabled
		elem: null,									// HTMLObject to be used for data input
		fxOptions: {},								// additional options for the Fx.Tween if useFx is true
		localOnly: false,							// only use the localOptions, do not query server for options if true
		localOptions: null,							// JSON object or array containing local options to prime cache with.
		maxOptions: 10,								// max menuOptions to show at once
		method: 'post',								// HTTP request method
		minLength: 1,								// number of characters needing to be typed before suggesting
		noResults: 'Nothing matches...',			// display if user input returns an empty set
		relative: false,							// menu is relative position to element
		requestVar: 'request',						// name of variable to post back to server with user input
		selectFirst: true,							// selects the first menu option on_show()
		staticInject: 'before',						// where to inject staticOptions if set [before, after]
		staticOptions: null,						// items to always show in menu
		stylize: true,								// stylize the menu items according to this.filter() if matches at beginning
		stylizeAny: false,							// if stylize = true and stylizeAny = true, stylize any matches
		tabSelect: false,							// if true tab key selects highlighted item, does not select, if false
		url: '',									// URL for requests
		useCache: true,								// use a local cache to prevent un-necessary calls to server
		useFx: true,								// use effects on showing / hiding menu, more to come, yes?
		waitClass: 'suggest-opts-wait',				// default class for when request is being processed by server
		width: '',									// width of menu
		zIndex: 50									// default z-index for menu
/*
		// Class Events
		onRequest: function() { if (this.options.disable === false) { this.element.addClass(this.options.waitClass); }},		// fires when a request is sent to server
		onComplete: function() { if (this.options.disable === false) { this.element.removeClass(this.options.waitClass); }},	// when request returns, and menu is built
		onSelect: $empty,																// upon user selecting an option from menu
		onHide: $empty,																	// upon hiding the menu
		onShow: $empty																	// upon showing of the menu
*/
	},

	// internal (private) variables
	cache: null,				// object for storing the cache...
	count: 0,					// internal option id
	element: null,				// the element to capture input from
	elementClone: null,			// a clone to store original events of element when clearing.
	history: [],				// keep a history of the selected options
	menu: null,					// the menu HTMLObject
	menuOptions: null,			// item data set in this.process_request()
	request: null,				// the Request object
	shown: false,				// is menu currently being shown?
	selected: false,			// the currently selected menu option
	text: '',					// current element value.
	version: '0.1.1',			// current version of MavSuggest, duh. ;)

	/**
	 * constructor method
	 * @param {String}|{Object} Element ID | Options object
	 * @param {String} [RequestURL]
	 * @param {String} [RequestVariable]
	 */
	initialize: function(_options, _url, _reqvar) {
		if ($defined(_options) && $defined(_url) && $type(_options) == 'string') {
			_options = {'elem': _options, 'url': _url, 'requestVar': (_reqvar || this.options.requestVar)};
		} else  if (!$(_options.elem) || !_options.url) return null;
		this.setOptions(_options);

		// if localOptions is supplied
		this.cache = ($defined(this.options['localOptions']) ? new Hash(this.options.localOptions) : (this.options.useCache ? new Hash({}) : null));
		delete this.options.localOptions;

		// set elem events
		this.element = $(_options.elem || _options.element).addEvents({
			'keyup': this.suggest.bind(this),
			'keydown': this.watch_actions.bind(this)
		});
		this.elementClone = new Element('div');

		// create the menu
		this.make_menu();
	},

	/**
	 * destructor object
	 */
	destroy: function() {
		this.clear_cache();
		this.empty_menu();

		$unlink(this.element);
		this.menu.dispose(); this.elementClone.dispose();
	},

	/**
	 * generates the DOM elements for the menu.
	 * This function can be overridden to change the display of the menu.
	 */
	make_menu: function() {
		this.element.set('autocomplete', 'off');
		this.menu = new Element('ul', {
			'id': this.element.get('id') + '_menu', 
			'class': this.options.class_name,
			'styles': {
				'display': 'none',
				'width': this.options.width,
				'zIndex': this.options.zIndex
			}
		}).inject(document.body);

		if (this.options.relative) {
			this.menu.inject(this.element, 'after');
			this.options.rel_parent = this.element.getOffsetParent();
		}

		this.fx = this.options.useFx ? new Fx.Tween(this.menu, $merge({
			'duration': '200', 
			'link': 'cancel'
		}, this.options.fxOptions)) : null;
	},

	/**
	 * used to correctly place the menu when needed.
	 */
	place_menu: function() {
		var coords = this.element.getCoordinates();
		this.menu.setStyles({ 'left': coords.left, 'top': ((coords.top + coords.height)-1) });
		this.show_menu();

		if (this.options.selectFirst) { this.set_selected(this.menu.firstChild); }
	},

	/**
	 * generates items for the menu from the given _data
	 * this function can be overridden to change the display of each menu item
	 * @param {Object} Object containing option data
	 * @param [{Boolean} Can the option be selected?]
	 */
	make_option: function(_data, _unselectable) {
		if ($defined(_data)) {
			var data = ($type(_data)=='string' ? {'html':_data} : _data);
			var elem_info = {
					'id': (data['id'] || (++this.count)) + '_opt',
					'text': (data['text'] || data['html'].strip_tags()),
					'html': this.display_filter(data['html']),
					'unselectable': _unselectable
			};
			var menu_item = new Element('li', elem_info).inject(this.menu);
			this.set_option_events(menu_item.store('optiondata', $merge(_data, elem_info)));
		}
	},
	
	/**
	 * attaches the needed events to give element
	 * @param {HTMLElement} Element to attach events to
	 */
	set_option_events: function(_elem) {
		return (_elem.get('unselectable') != true) ? _elem.addEvents({
			'mouseover': this.set_selected.bind(this, _elem.get('id')),
			'mousedown': this.choose_option.bind(this, _elem.get('id'))
		}) : _elem;
	},

	/**
	 * highlights and sets a menu option as the selected option
	 * @param {String|null} Element or direction to select option
	 */
	set_selected: function(_dir) {
		if (this.menu.firstChild) {
			var cur, new_select = ($(_dir) || this.menu.firstChild);
			if (new_select.get('unselectable') != 'true') {
				if ($(this.selected)) {
					this.selected.removeClass('selected');
					if (!_dir) { this.selected = false; return; }

					new_select = (_dir == 'up' && this.selected.getPrevious() ? this.selected.getPrevious() : 
								  (_dir == 'down' && this.selected.getNext() ? this.selected.getNext() : new_select));
				}
				new_select.addClass('selected');
				this.selected = new_select;
			}
		}
	},

	/**
	 * fires when user choses a menu item, fires user defined onSelect event
	 * @param {String} Option element to select
	 * 
	 * Yes, it is CHOOSE, chose is past-tense.
	 * http://www.planetoid.org/grammar_for_geeks/chose_vs_choose.html
	 */
	choose_option: function(_elemid) {
		if (this.selected !== false) {
			var elem, elem_text = $(_elemid).get('text').trim();

			if (this.options.allowDupes == true || this.history.contains(elem_text) == false) {
				this.text = '';

				this.history.push(elem_text);
				elem_text = (this.options.autoClear == true ? '' : (this.options.autoTrim ? elem_text.trim() : elem_text));
				this.element.set('value', elem_text);
				this.hide_menu();

				if ((elem = $(this.options.append)) != null) {
					var attrib = (elem.get('tag').match(/input|textarea/) ? 'value' : 'html');
					elem.set(attrib, elem.get(attrib) + (elem.get(attrib).trim()==''?'':', ') + $(_elemid).retrieve('optiondata').text);
					this.element.set('value', '').focus();
				}

				var option_data = $(_elemid).retrieve('optiondata');
				this.set_selected();

				this.fireEvent('select', option_data);
			}
		}
	},

	/**
	 * displays the menu, if no options are present, or is currently being shown, exits
	 */
	show_menu: function() {
		if (this.menu.firstChild && this.shown === false) {
			if (this.fx && this.options.useFx == true) {
				this.menu.setStyles({'display':'block','opacity':0}); 
				this.fx.start('opacity', 0, 1);
			} else { this.menu.setStyle('display', 'block'); }

			var self = this;
			this.elementClone.cloneEvents(this.element);
			this.element.removeEvents('blur').addEvent('blur', function() {
				self.hide_menu.delay(200, self); 
			});
			this.shown = true;

			this.fireEvent('show');
		}
	},

	/**
	 * hides the menu
	 */
	hide_menu: function() {
		if (this.shown === true) {
			this.element.removeEvents('blur').cloneEvents(this.elementClone);

			var hide_menu = function() {
				this.menu.setStyle('display', 'none');
				this.set_selected();
				this.shown = false;
			}.bind(this);

			if (this.fx && this.options.useFx == true) { this.fx.start('opacity', 1, 0).chain(hide_menu); }
			else { hide_menu(); }

			this.fireEvent('hide');
		}
	},

	/**
	 * empties the menu, and this.element
	 */
	empty_menu: function() {
		this.hide_menu();
		this.element.set('value', '');
		this.menu.empty();
	},

	/**
	 * function for watching for usability and user interaction
	 * @param {Event} Window event
	 */
	watch_actions: function(e) {
		if (this.options.disable === true) { return; }
		var evt = new Event(e);
		switch(evt.key) {
			case 'esc':
				this.hide_menu();
				break;

			case 'tab':
				this.hide_menu();
				if (!this.options.tabSelect) { break; }

			case 'enter':
				if (this.selected) { this.choose_option(this.selected); }
				break;

			case 'up': case 'down':
				if (this.shown === false) { this.show_menu(); }
				this.set_selected(evt.key);
				break;
		}
	},

	/**
	 * if user input exists, query cache, or server for applicable menu options
	 * @param {Event} window event
	 */
	suggest: function(e) {
		if (this.options.disable === false && this.element.value != this.element.defaultValue) {
			var txt = this.element.get('value'), cache_options;
			if (txt != this.text && txt.length >= this.options.minLength) {
				this.text = txt;
				if ((cache_options = this.query_cache()) !== false) {
					this.process_request(cache_options);
				} else if (this.options.localOnly != true){
					this.request.send(this.options.requestVar + '=' + encodeURI(this.text));
					this.fireEvent('request'); // event fired on sending of request
				}
			}
		}
	},

	/**
	 * filters menu item text for formatting.
	 * @param {String} Text to format
	 */
	display_filter: function(_txt) {
		return (this.options.stylize != false ? _txt.replace(new RegExp((this.options.stylizeAny?'':'^') + '(' + this.text + ')', 'gi'), '<span>$1</span>') : _txt);
	}
});

/**
 * @class MavSuggest.Request
 * @extends MavSuggest
 * @abstract MooTools class for handling autocomplete/suggestive user input
 * @version 1.1.0
 * @license MIT-style license
 * @author Dustin C Hansen <dustin [at] maveno.us>
 * @copyright Copyright (c) 2008 [Dustin Hansen](http://maveno.us).
 */

MavSuggest.Request = new Class({
	Extends: MavSuggest,
	options: { },

	/**
	 * override this class in inheriting class
	 * @param {Array} Data returned from server request
	 */
	process_request: function(_data) {
		this.menu.empty();
		this.selected = false;
		if ($type(_data) != 'array' || _data.length == 0) {
			this.make_option(this.options.noResults, true);
			return false;
		}
		
		return true;
	},

	query_cache: function(_txt) {
		var txt = (_txt || this.text);
		return ((this.options.useCache != false && this.cache.has(txt)) ? this.cache.get(txt) : false);
	},

	// clears cached requests
	clear_cache: function() {
		this.cache = new Hash({});
	}
});


/**
 * @class MavSuggest.Request.JSON
 * @extends MavSuggest.Request
 * @abstract MooTools class for handling autocomplete/suggestive user input
 * @version 1.1.0
 * @license MIT-style license
 * @author Dustin C Hansen <dustin [at] maveno.us>
 * @copyright Copyright (c) 2008 [Dustin Hansen](http://maveno.us).
 */

MavSuggest.Request.JSON = new Class({
	Extends: MavSuggest.Request,

	initialize: function(_options, _url, _reqvar) {
		this.parent(_options, _url, _reqvar);
		this.request = new Request.JSON({
			'url': this.options.url,
			'method': this.options.method,
			'link': 'cancel',
			'onSuccess': this.process_request.bind(this)
		});
	},

	// Handles JSON responses; 
	// ['list','of','values'] || [{'id':'1','html':'Weeee'},{'html':'MUST BE PRESENT', 'anything':'you','want':'here'}]
	process_request: function(_data) {
		if (this.parent(_data) === true) {
			this.count = 0;

			this.menuOptions = _data;
			// allow customizable menu options
			if (this.options.staticOptions != null) {
				var statics = $A(this.options.staticOptions);
				this.menuOptions = (this.options.staticInject != 'before' ? this.menuOptions.combine(statics) : statics.combine(this.menuOptions));
			}

			// create menu options and display menu
			for(var i=0; i<this.options.maxOptions; i++) {
				if (i < this.menuOptions.length) { this.make_option(this.menuOptions[i]); }
				else { break; }
			}
			this.place_menu(true);

			// cache server result if caching
			if (this.options.useCache != false) { this.cache.set(this.text, _data); }
		}

		this.fireEvent('complete');
	}
});


/**
 * @class MavSuggest.Request.HTML
 * @extends MavSuggest.Request
 * @abstract MooTools class for handling autocomplete/suggestive user input
 * @version 1.1.0
 * 
 * @TODO need to figure best way to handle process_request, this should allow for inputing HTML into the menu items. links, meta info, etc.
 * 
 * @license MIT-style license
 * @author Dustin C Hansen <dustin [at] maveno.us>
 * @copyright Copyright (c) 2008 [Dustin Hansen](http://maveno.us).
 */


// INCOMPLETE!!!!!
// will be completed and released in the next major version
/*
MavSuggest.Request.HTML = new Class({
	Extends: MavSuggest.Request,

	initialize: function(_options, _url, _reqvar) {
		this.parent(_options, _url, _reqvar);
		this.request = new Request.HTML({
			'url': this.options.url,
			'link': 'cancel',
			'method': this.options.method,
			'onSuccess': this.process_request.bind(this)
		});
	},

	// Handles JSON responses; 
	// {'noresults':1} || [] || [{'id':'1','html':'some'},{'id':'2','html':'else','anything':'you','want':'here'}]
	process_request: function(_data) {
		if ($type(_data) != 'array' || _data.noresults || _data.length == 0) {
			this.menu.empty();
			this.make_option({'html': 'No data matches your request...'}, true);
		} else {
			this.menu.empty();
			this.count = 0;

			// allow customizable menu options
			if (!this.options.staticOptions) {
				this.menuOptions = this.options.staticOptions + this.menuOptions;
			}

			for(var i=0; i<this.options.maxOptions; i++) {
				if (i < _data.length) { this.make_option(_data[i]); }
				else { break; }
			}
			this.place_menu(true);

			if (this.options.useCache != false) { this.cache.set(this.text, _data); }
		}

		this.fireEvent('complete');
	}
});
*/

/**
 * Extending the native objects
 */
String.implement({
	strip_tags: function() { return (this.stripScripts()).replace(/<\/?[^>]+>/gmi, ''); }
});
