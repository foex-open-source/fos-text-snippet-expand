/* globals apex,$ */

var FOS = window.FOS || {};
FOS.utils = FOS.utils || {};

/**
 * A dynamic action to extend a text field to listen for entered shortcuts and expand them into text (e.g. lol -> laughing out loud)
 *
 * @param {object}   daContext         Dynamic Action context as passed in by APEX
 * @param {object}   config            Configuration object holding the expand settings
 * @param {string}   config.stopChars  Keys/Characters the method is looking for before evaluating a text snippet
 * @param {object}   config.dictionary The shortcut/text dictionary
 * @param {function} [initFn]          JS initialization function which will allow you to override settings right before the notificaton is sent
 */
(function($){
FOS.utils.textSnippetExpand = function (daContext, config, initFn) {

    // parameter checks
    daContext = daContext || this;
    config = config || {};

    var pluginName = 'FOS - Textarea Snippet Expand';
    apex.debug.info(pluginName, config);

    // Allow the developer to perform any last (centralized) changes using Javascript Initialization Code setting
    if (initFn instanceof Function) {
        initFn.call(daContext, config);
    }

    // we will not perform any action if there is no dictionary or there are no stopChars
    if (!config || !config.dictionary || !config.stopChars) return;

    var l_stopKey = [],
        l_stopKeyCode = []
        ;

    // set stop keys/characters which were chosen for this dynamic action
    config.stopChars.split(":").forEach(function (stopChar) {
        l_stopKey.push(FOS.utils.textSnippetExpand.CHARS[stopChar].key);
        l_stopKeyCode.push(FOS.utils.textSnippetExpand.CHARS[stopChar].keyCode);

        // IE11 returns "Spacebar" instead of " " (as every other browser)
        if (stopChar === "SPACE") {
            l_stopKey.push("Spacebar");
        }
    })

    // original source from https://github.com/hasinhayder/javascript-text-expander/
    // modified to our and APEX needs
    for (let l_idx = 0; l_idx < daContext.affectedElements.length; l_idx++) {
        let elem = daContext.affectedElements[l_idx];

        let isCKEditor = $(elem).hasClass('rich_text_editor');

        if (isCKEditor && window.CKEDITOR) {
            // an extra CKEditor4 plug-in is needed to perform transformations
            // scriptLoader.load will only load the script once, even when called multiple times
            CKEDITOR.scriptLoader.load(config.automatchPluginUrl, function (success) {
                if (!success) {
                    console.error('Could not load automatch plugin');
                    return;
                }
                FOS.utils.textSnippetExpand.ckeditor4(elem.id, config);
            });
        } else if (isCKEditor && window.ClassicEditor) {
            console.warn(pluginName || ' does not yet support CKEditor5');
        } else if ($(elem).hasClass('text_field') || $(elem).hasClass('textarea')) {
            elem.removeEventListener("keydown", textExpanderEventListener); //remove duplicate event listener, if any
            elem.addEventListener("keydown", textExpanderEventListener);

            elem.removeEventListener("keyup", textHistoryEventListener); //remove duplicate event listener, if any
            elem.addEventListener("keyup", textHistoryEventListener);
        } else {
            console.warn(pluginName || ' only supports text fields, text areas and CKEditor4.');
        }
    };

    function textExpanderEventListener(data) {
        var actionKeys, dataKey;
        if (data.key == undefined) {
            dataKey = data.keyCode;
            actionKeys = l_stopKeyCode;
        } else {
            dataKey = data.key;
            actionKeys = l_stopKey
        }

        apex.debug.trace('Key ', data.key, data.keyCode, data.code);

        // revert just happened text-expand on Ctrl/Cmd-Z
        if ((data.which == 90 || data.keyCode == 90) && (data.ctrlKey || data.metaKey) && this.dataset.lastReplaced && this.dataset.lastKeystroke) {
            var regexp = new RegExp(config.dictionary[this.dataset.lastReplaced] + this.dataset.lastKeystroke + '$');
            if (regexp.test(this.value)) {
                data.preventDefault();
                this.value = this.value.replace(regexp, this.dataset.lastReplaced + this.dataset.lastKeystroke);
            }
            delete this.dataset.lastReplaced;
            delete this.dataset.lastKeystroke;
            return;
        }

        if (actionKeys.includes(dataKey)) {
            var selection = getCaretPosition(this);
            var result = /\S+$/.exec(this.value.slice(0, selection.end));
            if (result) {
                var lastWord = result[0];
                var selectionStart = result.input.length - lastWord.length;
                replaceLastWord(this, selectionStart, result.input.length, lastWord);
            }
        }
    }

    function textHistoryEventListener(data) {
        var actionKeys, dataKey;
        if (data.key == undefined) {
            dataKey = data.keyCode;
            actionKeys = l_stopKeyCode;
        } else {
            dataKey = data.key;
            actionKeys = l_stopKey;
        }
        if (actionKeys.includes(dataKey)) {
            this.dataset.lastKeystroke = this.value.substr(-1);
        } else {
            delete this.dataset.lastReplaced;
        }
    }


    function getCaretPosition(ctrl) {
        var start, end;
        if (ctrl.setSelectionRange) {
            start = ctrl.selectionStart;
            end = ctrl.selectionEnd;
        } else if (document.selection && document.selection.createRange) {
            var range = document.selection.createRange();
            start = 0 - range.duplicate().moveStart('character', -100000);
            end = start + range.text.length;
        }
        return {
            start: start,
            end: end
        }
    }

    function replaceLastWord(ctrl, start, end, key) {
        var rangeLength = end - start;
        var replaceWith = config.dictionary[key];
        if (!replaceWith) {
            return;
        }
        if (ctrl.setSelectionRange) {
            /* WebKit */
            ctrl.focus();
            ctrl.setSelectionRange(start, end);
        }
        else if (ctrl.createTextRange) {
            /* IE */
            var range = ctrl.createTextRange();
            rangctrl.collapse(true);
            rangctrl.moveEnd('character', end);
            rangctrl.moveStart('character', start);
            rangctrl.select();
        }
        else if (ctrl.selectionStart) {
            ctrl.selectionStart = start;
            ctrl.selectionEnd = end;
        }
        if (replaceWith) {
            ctrl.value = ctrl.value.substring(0, start) + replaceWith + ctrl.value.substr(end);
            ctrl.setSelectionRange(end + replaceWith.length, end + replaceWith.length - (rangeLength));
            ctrl.dataset.lastReplaced = key;
        }
    }

};

// broadly based on https://github.com/ckeditor/ckeditor4/blob/master/plugins/autolink/plugin.js
FOS.utils.textSnippetExpand.ckeditor4 = function (itemName, config) {
    let editor = CKEDITOR.instances[itemName];
    let chars = config.stopChars.split(':').map(char => FOS.utils.textSnippetExpand.CHARS[char].key);
    editor.on('key', function (evt) {
        var keyPressed = evt.data.domEvent.$.key;
        if (chars.indexOf(keyPressed) == -1) {
            return;
        }

        var matched = CKEDITOR.plugins.textMatch.match(editor.getSelection().getRanges()[0], function (text, offset) {
            var parts = text.slice(0, offset).split(/\s+/);
            var query = parts[parts.length - 1];
            if (!query) {
                return null;
            }
            return { start: text.lastIndexOf(query), end: offset };
        });

        if (matched && matched.text) {
            let newText = config.dictionary[matched.text];
            if (newText) {
                editor.insertHtml(newText, 'text', matched.range);
            }
        }
    });
}

FOS.utils.textSnippetExpand.CHARS = {
    "SPACE": {
        "key": " ",
        "keyCode": 32
    },
    "PERIOD": {
        "key": ".",
        "keyCode": 190
    },
    "COMMA": {
        "key": ",",
        "keyCode": 188
    },
    "ENTER": {
        "key": "Enter",
        "keyCode": 13
    },
    "TAB": {
        "key": "Tab",
        "keyCode": 9
    },
    "COLON": {
        "key": ":",
        "keyCode": 186
    },
    "SEMICOLON": {
        "key": ";",
        "keyCode": 186
    },
    "QUESTION": {
        "key": "?",
        "keyCode": 191
    },
    "EXCLAMATION": {
        "key": "!",
        "keyCode": 49
    }
};
})(apex.jQuery);

