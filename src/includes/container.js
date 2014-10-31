    (function(){
        /**
         * Methods related to suggestions dropdown list
         */

        function formatToken(token) {
            return token.toLowerCase().replace(/[ёЁ]/g, 'е');
        }

        function withSubTokens(tokens) {
            var result = [];

            $.each(tokens, function (i, token) {
                var subtokens = token.split(wordPartsSplitter);

                result.push(token);

                if (subtokens.length > 1) {
                    result = result.concat(subtokens);
                }
            });

            return result;
        }

        function highlightMatches(chunks) {
            return $.map(chunks, function (chunk) {
                var text = '';

                if (chunk.wordOriginal) {
                    text += utils.escapeHtml(chunk.wordOriginal);
                }

                if (text && chunk.matched) {
                    text = '<strong>' + text + '</strong>';
                }
                if (chunk.before) {
                    text = utils.escapeHtml(chunk.before) + text;
                }
                if (chunk.after) {
                    text += utils.escapeHtml(chunk.after);
                }

                return text;
            }).join('');
        }

        function nowrapLinkedParts(formattedStr, nowrapClass) {
            var delimitedParts = formattedStr.split(', ');
            // string has no delimiters, should not wrap
            if (delimitedParts.length === 1) {
                return formattedStr;
            }
            // disable word-wrap inside delimited parts
            return $.map(delimitedParts, function (part) {
                return '<span class="' + nowrapClass + '">' + part + '</span>'
            }).join(', ');
        }

        function hasAnotherSuggestion (suggestions, suggestion) {
            var result = false;

            $.each(suggestions, function (i, s) {
                result = s.value == suggestion.value && s != suggestion;
                if (result) {
                    return false;
                }
            });

            return result;
        }

        var methods = {

            createContainer: function () {
                var that = this,
                    suggestionSelector = '.' + that.classes.suggestion,
                    options = that.options,
                    $container = $('<div/>')
                        .addClass(options.containerClass)
                        .css({
                            position: 'absolute',
                            display: 'none'
                        });

                that.$container = $container;
                that.$wrapper.append($container);

                // Only set width if it was provided:
                if (options.width !== 'auto') {
                    $container.width(options.width);
                }

                $container.on('click' + eventNS, suggestionSelector, $.proxy(that.onSuggestionClick, that));
            },

            // Dropdown event handlers

            /**
             * Listen for click event on suggestions list:
             */
            onSuggestionClick: function (e) {
                var that = this,
                    $el = $(e.target),
                    index;

                if (!that.dropdownDisabled) {
                    while ($el.length && !(index = $el.attr('data-index'))) {
                        $el = $el.closest('.' + that.classes.suggestion);
                    }
                    if (index && !isNaN(index)) {
                        that.select(+index);
                    }
                }
                that.cancelFocus = true;
                that.el.focus();
            },

            // Dropdown UI methods

            setDropdownPosition: function (origin, elLayout) {
                var that = this;

                that.$container
                    .toggleClass(that.classes.mobile, that.isMobile)
                    .css(that.isMobile ? {
                        left: origin.left - elLayout.left + 'px',
                        top: origin.top + elLayout.outerHeight + 'px',
                        width: that.$viewport.width() + 'px'
                    } : {
                        left: origin.left + 'px',
                        top: origin.top + elLayout.borderTop + elLayout.innerHeight + 'px',
                        width: (that.options.width === 'auto' ? that.el.outerWidth() : that.options.width) + 'px'
                    });

                that.containerItemsPadding = elLayout.left + elLayout.borderLeft + elLayout.paddingLeft;
            },

            setItemsPositions: function () {
                var that = this,
                    $items = that.getSuggestionsItems();

                $items.css('paddingLeft', that.isMobile ? that.containerItemsPadding + 'px' : '');
            },

            getSuggestionsItems: function () {
                return this.$container.children('.' + this.classes.suggestion);
            },

            toggleDropdownEnabling: function (enable) {
                this.dropdownDisabled = !enable;
                this.$container.attr('disabled', !enable);
            },

            disableDropdown: function () {
                this.toggleDropdownEnabling(false);
            },

            enableDropdown: function () {
                this.toggleDropdownEnabling(true);
            },

            /**
             * Shows if there are any suggestions besides currently selected
             * @returns {boolean}
             */
            hasSuggestionsToChoose: function () {
                var that = this;
                return that.suggestions.length > 1 ||
                    (that.suggestions.length === 1 &&
                        (!that.selection || $.trim(that.suggestions[0].value) != $.trim(that.selection.value))
                    );
            },

            suggest: function () {
                if (!this.hasSuggestionsToChoose()) {
                    this.hide();
                    return;
                }

                var that = this,
                    options = that.options,
                    formatResult = options.formatResult || that.type.formatResult || that.formatResult,
                    beforeRender = options.beforeRender,
                    html = [],
                    index;

                // Build hint html
                if (!that.isMobile && options.hint && that.suggestions.length) {
                    html.push('<div class="' + that.classes.hint + '">' + options.hint + '</div>');
                }
                that.selectedIndex = -1;
                // Build suggestions inner HTML:
                $.each(that.suggestions, function (i, suggestion) {
                    var labels = that.makeSuggestionLabel(that.suggestions, suggestion);

                    if (suggestion == that.selection) {
                        that.selectedIndex = i;
                    }
                    html.push(
                        '<div class="' + that.classes.suggestion + '" data-index="' + i + '">' +
                            formatResult.call(that, suggestion.value, that.currentValue, suggestion, {
                                unformattableTokens: that.type.STOPWORDS
                            })
                    );
                    if (labels) {
                        html.push('<span class="' + that.classes.subtext_label + '">' + utils.escapeHtml(labels) + '</span>');
                    }
                    html.push('</div>');
                });

                that.$container.html(html.join(''));

                // Select first value by default:
                if (options.autoSelectFirst && that.selectedIndex === -1) {
                    that.selectedIndex = 0;
                }
                if (that.selectedIndex !== -1) {
                    that.getSuggestionsItems().eq(that.selectedIndex).addClass(that.classes.selected);
                }

                if ($.isFunction(beforeRender)) {
                    beforeRender.call(that.element, that.$container);
                }

                that.$container.show();
                that.visible = true;
                that.setItemsPositions();
            },

            /**
             * Makes HTML contents for suggestion item
             * @param {String} value string to be displayed as a value
             * @param {String} currentValue contents of the textbox
             * @param suggestion whole suggestion object with displaying value and other fields
             * @param {Object} [options] set of flags:
             *          `unformattableTokens` - array of search tokens, that are not to be highlighted
             *          `maxLength` - if set, `value` is limited by this length
             * @returns {String} HTML to be inserted in the list
             */
            formatResult: function (value, currentValue, suggestion, options) {

                var that = this,
                    chunks = [],
                    unformattableTokens = options && options.unformattableTokens,
                    maxLength = options && options.maxLength || value.length,
                    tokens = formatToken(currentValue).split(wordSplitter),
                    partialTokens = withSubTokens([tokens[tokens.length -1]]),
                    partialMatchers = $.map(partialTokens, function (token) {
                        return new RegExp('^(.*[' + wordPartsDelimiters+ ']+)?(' + utils.escapeRegExChars(token) + ')(?=[^' + wordDelimiters + ']+)', 'i')
                    }),
                    rWords = utils.reWordExtractor(),
                    match, word;

                tokens = withSubTokens(tokens);

                // check for matching whole words
                while ((match = rWords.exec(value)) && match[0]) {
                    word = match[1] && formatToken(match[1]);
                    if (word) {
                        chunks.push({
                            before: null,

                            wordFormatted: word,
                            wordOriginal: match[1],
                            matched: $.inArray(word, unformattableTokens) === -1 && $.inArray(word, tokens) >= 0,

                            after: match[2],
                            length: match[0].length
                        });
                    } else {
                        chunks.push({
                            after: match[0]
                        });
                    }
                }

                // check for partial match
                $.each(chunks, function (i, chunk) {
                    if (!chunk.matched && chunk.wordFormatted && $.inArray(chunk.wordFormatted, unformattableTokens) === -1) {
                        $.each(partialMatchers, function (i, matcher) {
                            var match = matcher.exec(chunk.wordFormatted),
                                beforeLength;

                            if (match && match[2]) {
                                beforeLength = match[1] == null ? 0 : match[1].length;
                                chunk.matched = true;
                                chunk.before = chunk.wordOriginal.substr(0, beforeLength);
                                chunk.after = chunk.wordOriginal.substr(beforeLength + match[2].length) + chunk.after;
                                chunk.wordOriginal = chunk.wordOriginal.substr(beforeLength, match[2].length);
                                return false;
                            }
                        });
                    }

                    maxLength -= chunk.length;
                    if (maxLength < 0) {
                        checkChunkField(chunk, 'after');
                        checkChunkField(chunk, 'wordOriginal');
                        checkChunkField(chunk, 'before');

                        chunks.length = i + 1;
                        return false;
                    }
                });

                var formattedStr = highlightMatches(chunks);
                return nowrapLinkedParts(formattedStr, that.classes.nowrap);

                function checkChunkField (chunk, field) {
                    var length;

                    if (chunk[field]) {
                        length = chunk[field].length;
                        maxLength += length;
                        chunk[field] = chunk[field].substr(0, maxLength);
                        if (maxLength > 0 && maxLength < length) {
                            chunk[field] += '...';
                        }
                    }
                }

            },

            makeSuggestionLabel: function (suggestions, suggestion) {
                var that = this,
                    fieldNames = that.type.fieldNames,
                    nameData = {},
                    rWords = utils.reWordExtractor(),
                    match, word,
                    labels = [];

                if (fieldNames && hasAnotherSuggestion(suggestions, suggestion) && suggestion.data) {

                    $.each(fieldNames, function (field) {
                        var value = suggestion.data[field];
                        if (value) {
                            nameData[field] = formatToken(value);
                        }
                    });

                    if (!$.isEmptyObject(nameData)) {
                        while ((match = rWords.exec(formatToken(suggestion.value))) && (word = match[1])) {
                            $.each(nameData, function (i, value) {
                                if (value == word) {
                                    labels.push(fieldNames[i]);
                                    delete nameData[i];
                                    return false;
                                }
                            });
                        }

                        if (labels.length) {
                            return labels.join(', ');
                        }
                    }
                }
            },

            hide: function () {
                var that = this;
                that.visible = false;
                that.selectedIndex = -1;
                that.$container.hide()
                    .empty();
            },

            activate: function (index) {
                var that = this,
                    $activeItem,
                    selected = that.classes.selected,
                    $children;

                if (!that.dropdownDisabled) {
                    $children = that.getSuggestionsItems();

                    $children.removeClass(selected);

                    that.selectedIndex = index;

                    if (that.selectedIndex !== -1 && $children.length > that.selectedIndex) {
                        $activeItem = $children.eq(that.selectedIndex);
                        $activeItem.addClass(selected);
                        return $activeItem;
                    }
                }

                return null;
            },

            deactivate: function (restoreValue) {
                var that = this;

                if (!that.dropdownDisabled) {
                    that.selectedIndex = -1;
                    that.getSuggestionsItems().removeClass(that.classes.selected);
                    if (restoreValue) {
                        that.el.val(that.currentValue);
                    }
                }
            },

            moveUp: function () {
                var that = this;

                if (that.dropdownDisabled) {
                    return;
                }
                if (that.selectedIndex === -1) {
                    if (that.suggestions.length) {
                        that.adjustScroll(that.suggestions.length - 1);
                    }
                    return;
                }

                if (that.selectedIndex === 0) {
                    that.deactivate(true);
                    return;
                }

                that.adjustScroll(that.selectedIndex - 1);
            },

            moveDown: function () {
                var that = this;

                if (that.dropdownDisabled) {
                    return;
                }
                if (that.selectedIndex === (that.suggestions.length - 1)) {
                    that.deactivate(true);
                    return;
                }

                that.adjustScroll(that.selectedIndex + 1);
            },

            adjustScroll: function (index) {
                var that = this,
                    $activeItem = that.activate(index),
                    itemTop,
                    itemBottom,
                    scrollTop = that.$container.scrollTop(),
                    containerHeight;

                if (!$activeItem || !$activeItem.length) {
                    return;
                }

                itemTop = $activeItem.position().top;
                if (itemTop < 0 ) {
                    that.$container.scrollTop(scrollTop + itemTop);
                } else {
                    itemBottom = itemTop + $activeItem.outerHeight();
                    containerHeight = that.$container.innerHeight();
                    if (itemBottom > containerHeight) {
                        that.$container.scrollTop(scrollTop - containerHeight + itemBottom);
                    }
                }

                that.el.val(that.suggestions[index].value);
            }

        };

        $.extend(Suggestions.prototype, methods);

        notificator
            .on('initialize', methods.createContainer)
            .on('fixPosition', methods.setDropdownPosition)
            .on('fixPosition', methods.setItemsPositions)
            .on('assignSuggestions', methods.suggest);

    }());