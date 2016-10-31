
'use strict';

function getHostname(url) {
    var res = url.match(/^(.*:\/\/)([a-zA-Z0-9\-\.]+)(:[0-9]+)?(.*)$/);
    if (res && res[2])
        return res[2];
    else
        return false;
}

function refreshSite() {

    chrome.tabs.query({ active: true, currentWindow: true }, function (arrayOfTabs) {

        var current_url = arrayOfTabs[0].url;
        var hostname = getHostname(current_url);
        if (hostname) {

            var backgroundpage = chrome.extension.getBackgroundPage();

            if (hostname in backgroundpage.userSetUnblockDomains) {
                alert("Already Registered!!!");
            } else {
                backgroundpage.userSetUnblockDomains[hostname] = 1;

                chrome.tabs.reload(arrayOfTabs[0].id);
            }
        }

    });
}

$(function () {

    $(document).ready(function () {
        var bFilterFlag = chrome.extension.getBackgroundPage().bFilterFlag;

        if (bFilterFlag == 0) {
            $('#ignore').addClass('ignored').attr('data-hint', "Enable");
        }
        else {
            $('#ignore').removeClass('ignored').attr('data-hint', "Disable");
        }

        var allowAdsFlag = chrome.extension.getBackgroundPage().allowAdsFlag;

        $('#ad_checkbox').prop("checked", allowAdsFlag);

        var enforcement_mode = chrome.extension.getBackgroundPage().enforcementMode;
        if (enforcement_mode == 1)
            $("#high_enforcement").prop("checked", true);
        else
            $("#low_enforcement").prop("checked", true);
        /*
        var blockedUrls = chrome.extension.getBackgroundPage().blockedUrls;
        chrome.tabs.query({ active: true, currentWindow: true }, function (arrayOfTabs) {
            var current_url = arrayOfTabs[0].url;
            var hostname = getHostname(current_url);
            if (hostname in blockedUrls) {
                $('#blocked').append('<p>Blocked urls:</p>');
                blockedUrls[hostname].forEach(function (value) {
                    $('#blocked').append('<p>' + value + '</p>');
                });
            }
        });
        */
    });

    $("#log_btn").click(
        function () {
            var n = chrome.extension.getURL("logger.html");
            var tabId = chrome.extension.getBackgroundPage().viewTabId;
            if (tabId != 0)
                try {
                    chrome.tabs.remove(tabId, function () { })
                }
                catch (t)
                { console.log(t) }
            chrome.tabs.create({ url: n })
    });

    $('#options').click(function () {
        if (!$(this).data("enabled")) {
            $("#setting_board").fadeOut('fast', function () {
                $('#options_box').show();
                $('#options').data('enabled', 1);

            })
        } else {
            $("#options_box").fadeOut('fast', function () {
                $('#setting_board').show();
                $('#options').data('enabled', 0);
            })
        }
    });

    $('#ignore').click(function () {
        var bFilterFlag = chrome.extension.getBackgroundPage().bFilterFlag;

        if (bFilterFlag == undefined)
            bFilterFlag = 1;

        if (bFilterFlag == 1) {
            bFilterFlag = 0;
            chrome.extension.getBackgroundPage().bFilterFlag = bFilterFlag;
            $('#ignore').addClass('ignored').attr('data-hint', "Enable");
        }
        else {
            bFilterFlag = 1;
            chrome.extension.getBackgroundPage().bFilterFlag = bFilterFlag;
            $('#ignore').removeClass('ignored').attr('data-hint', "Disable");
        }
    });

    $('#refreshPage_btn').click(function () {

        refreshSite();
    });

    $('#ad_checkbox').click(function () {
        if ($('#ad_checkbox').attr('checked')) {
            chrome.extension.getBackgroundPage().allowAdsFlag = true;
        } else {
            chrome.extension.getBackgroundPage().allowAdsFlag = false;
        }
    });

    $("#update_btn").click(function () {
        chrome.extension.getBackgroundPage().updateBfFiles();
    });

    $('input:radio[name="mode"]').change(function () {
        if ($(this).val() == 'low-enforcement') {
            chrome.extension.getBackgroundPage().enforcementMode = 0;
            chrome.tabs.query({ active: true, currentWindow: true }, function (arrayOfTabs) {

                var current_url = arrayOfTabs[0].url;
                var hostname = getHostname(current_url);
                if (hostname) {

                    var backgroundpage = chrome.extension.getBackgroundPage();
                    backgroundpage.blockedUrls[hostname] = new Set();
                }
            });
        }
        else {
            chrome.extension.getBackgroundPage().enforcementMode = 1;
        }
    });

});

