<?php 

	/**
	 * @name MavSuggest PHP Script Demo
	 * @author Dustin Hansen
	 * @link http://maveno.us/library/public/mavsuggest/
	 * 
	 * This script is to serve only as a basis for which to create your own.
	 * No guarantee of best security practices is made. In other words, take
	 * what you need from this, write your own, and remember to always use best
	 * security practices in doing so. This is a test, this is only a test...
	 * 
	 * PS; Just to make it clear(er), I am well aware that this script does not perform any
	 * sanity checks, MySQL injection checking, etc, etc. I did that for a reason. 
	 * This script is ONLY to show the clearest, simplest method by which to use the
	 * MavSuggest library, and allow you to write your own back-end from that.
	 * Seriously, do not use this as your production script. You have been warned.
	 */

	define('MAX_RESULTS', 10);

	// not the best method by which to store database credentials. Do NOT do this in production.
	// BUT, for testing purposes, simply change the data below to YOUR correct information.
	$db = array(
		'server'		=> 'localhost',
		'database'		=> 'YOUR_DATABASE_NAME',
		'username'		=> 'YOUR_USERNAME',
		'password'		=> 'YOUR_PASSWORD'
	);

	// this will allow for a default of no results to be returned
	$json = array("noresults"=>true);
	
	// get our user request from the post variable "request"
	$request = (array_key_exists('request', $_POST) ? $_POST['request'] : null);

	if (!is_null($request) && !empty($request)) {
		$response = array();
		($link = mysql_connect($db['server'], $db['username'], $db['password'])) or die("Cannot connect");
		mysql_select_db($db['database'], $link) or die("Cannot select database.");

		$query = "SELECT * FROM genre WHERE label LIKE '" . $request . "%' ORDER BY label LIMIT " . MAX_RESULTS;
		if (($results = mysql_query($query)) !== false && mysql_num_rows($results) > 0) {
			while($row = mysql_fetch_assoc($results)) {
				$response[] = $row;
			}
		}

		if (!empty($response)) {
			$json = array();
			foreach($response as $r) {
				// The JSON object that is being returned will expect a html property to be present if you are returning JSON objects.
				// which is used to display the text for each result. This could also be accomplished by
				// aliasing a Mysql field as html. I have done it this way in order to illustrate the need.
				$r['html'] = $r['label'];
				$json[] = $r;

				// the alternative is to simply return an array. If the only data you need is the text itself,
				// use this method instead.
				// $json[] = $r['label'];
			}
		}
	}

	if (!headers_sent()) header('Content-type: application/json');
	echo json_encode($json);

?>