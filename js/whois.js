


'use strict';


$(function () {
    var data = chrome.extension.getBackgroundPage().whoisData;
    var json = JSON.stringify(data);
    $("#whois").html(json);
});

