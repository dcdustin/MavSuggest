MavSuggest
==========

MavSuggest is an autocomplete (or text suggestion) mootools library which is able to query it's results from a server-side script, or a local cache of JSON objects. The server-side script results can also be cached to allow for both a faster result, and less server traffic. 

There are many options to customize the text field and the search results to match the look and feel of your web-site or web application. Keyboard and mouse interactions make it as intuitive as using any other form field. Effects are optional for an even quicker response and display time. 

![MavSuggest](http://github.com/dcdustin/MavSuggest/raw/master/logo.png)

How to use
----------
*CSS*

	#CSS
	#music_select { width: 400px; height: 24px; font-size: 105%; }

*JS*

	#JS
	var predict = new MavSuggest.Request.JSON({
		'append':'music_tags',
		'elem':'music_select',
		'tabSelect': false,
		'url':'/library/public/mavsuggest/predict.php'
	});

*HTML*

	#HTML
	<input type="text" id="music_select" value="">
