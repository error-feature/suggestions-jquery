// Expose plugin as an AMD module if AMD loader is present:
(function (factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else {
        // Browser globals
        factory(jQuery);
    }
}(function ($) {
    'use strict';

    var
        keys = {
            ENTER: 13,
            ESC:   27,
            TAB:   9,
            SPACE: 32,
            UP:    38,
            DOWN:  40
        },
        types = {},
        eventNS = '.suggestions',
        dataAttrKey = 'suggestions',
        wordDelimiters = '\\s"\'~\\*\\.,:\\|\\[\\]\\(\\)\\{\\}<>№',
        wordSplitter = new RegExp('[' + wordDelimiters + ']+', 'g'),
        wordPartsDelimiters = '\\-\\+\\/\\\\\\?!@#$%^&',
        wordPartsSplitter = new RegExp('[' + wordPartsDelimiters + ']+', 'g'),
        defaultOptions = {
            autoSelectFirst: false,
            serviceUrl: null,
            onSearchStart: $.noop,
            onSearchComplete: $.noop,
            onSearchError: $.noop,
            onSelect: null,
            onSelectNothing: null,
            onInvalidateSelection: null,
            minChars: 1,
            deferRequestBy: 100,
            params: {},
            paramName: 'query',
            timeout: 3000,
            formatResult: null,
            formatSelected: null,
            noCache: false,
            containerClass: 'suggestions-suggestions',
            tabDisabled: false,
            triggerSelectOnSpace: false,
            triggerSelectOnEnter: true,
            triggerSelectOnBlur: true,
            preventBadQueries: false,
            hint: 'Выберите вариант или продолжите ввод',
            type: null,
            count: 5,
            $helpers: null,
            headers: null,
            scrollOnFocus: true,
            mobileWidth: 980
        };

    var notificator = {

        chains: {},

        'on': function (name, method) {
            this.get(name).push(method);
            return this;
        },

        'get': function (name) {
            var chains = this.chains;
            return chains[name] || (chains[name] = []);
        }
    };

//include "utils.js"

//include "matchers.js"

//include "types.js"

    var serviceMethods = {
        'suggest': {
            defaultParams: {
                type: utils.getDefaultType(),
                dataType: 'json',
                contentType: utils.getDefaultContentType()
            },
            addTypeInUrl: true
        },
        'detectAddressByIp': {
            defaultParams: {
                type: 'GET',
                dataType: 'json'
            },
            addTypeInUrl: false
        },
        'status': {
            defaultParams: {
                type: 'GET',
                dataType: 'json'
            },
            addTypeInUrl: true
        }
    };

    function Suggestions(el, options) {
        var that = this;

        // Shared variables:
        that.element = el;
        that.el = $(el);
        that.suggestions = [];
        that.badQueries = [];
        that.selectedIndex = -1;
        that.currentValue = that.element.value;
        that.intervalId = 0;
        that.cachedResponse = {};
        that.enrichmentCache = {};
        that.currentRequest = null;
        that.inputPhase = $.Deferred();
        that.fetchPhase = $.Deferred();
        that.enrichPhase = $.Deferred();
        that.onChangeTimeout = null;
        that.triggering = {};
        that.$wrapper = null;
        that.options = $.extend({}, defaultOptions, options);
        that.classes = {
            hint: 'suggestions-hint',
            mobile: 'suggestions-mobile',
            nowrap: 'suggestions-nowrap',
            selected: 'suggestions-selected',
            suggestion: 'suggestions-suggestion',
            subtext: 'suggestions-subtext',
            subtext_inline: 'suggestions-subtext suggestions-subtext_inline',
            subtext_delimiter: 'suggestions-subtext-delimiter',
            subtext_label: 'suggestions-subtext suggestions-subtext_label',
            removeConstraint: 'suggestions-remove',
            value: 'suggestions-value'
        };
        that.disabled = false;
        that.selection = null;
        that.$viewport = $(window);
        that.$body = $(document.body);
        that.type = null;
        that.status = {};

        that.setupElement();
        if (that.el.is(':visible')) {
            that.initialize();
        } else {
            that.deferInitialization();
        }
    }

    Suggestions.utils = utils;

    Suggestions.defaultOptions = defaultOptions;

    Suggestions.version = '%VERSION%';

    $.Suggestions = Suggestions;

    Suggestions.prototype = {

        // Creation and destruction

        initialize: function () {
            var that = this;

            that.uniqueId = utils.uniqueId('i');

            that.createWrapper();
            that.notify('initialize');

            that.bindWindowEvents();

            that.setOptions();
            that.fixPosition();
        },

        /**
         * Initialize when element is firstly interacted
         */
        deferInitialization: function () {
            var that = this,
                events = 'mouseover focus keydown',
                callback = function () {
                    that.el.off(events, callback);
                    that.enable();
                    that.initialize();
                };

            that.disabled = true;
            that.el.on(events, callback);
        },

        dispose: function () {
            var that = this;
            that.notify('dispose');
            that.el.removeData(dataAttrKey)
                .removeClass('suggestions-input');
            that.unbindWindowEvents();
            that.removeWrapper();
            that.el.trigger('suggestions-dispose');
        },

        notify: function (chainName) {
            var that = this,
                args = utils.slice(arguments, 1);

            return $.map(notificator.get(chainName), function (method) {
                return method.apply(that, args);
            });
        },

        createWrapper: function () {
            var that = this;

            that.$wrapper = $('<div class="suggestions-wrapper"/>');
            that.el.after(that.$wrapper);

            that.$wrapper.on('mousedown' + eventNS, $.proxy(that.onMousedown, that));
        },

        removeWrapper: function () {
            var that = this;

            if (that.$wrapper) {
                that.$wrapper.remove();
            }
            $(that.options.$helpers).off(eventNS);
        },

        /** This whole handler is needed to prevent blur event on textbox
         * when suggestion is clicked (blur leads to suggestions hide, so we need to prevent it).
         * See https://github.com/jquery/jquery-ui/blob/master/ui/autocomplete.js for details
         */
        onMousedown: function (e) {
            var that = this;

            // prevent moving focus out of the text field
            e.preventDefault();

            // IE doesn't prevent moving focus even with e.preventDefault()
            // so we set a flag to know when we should ignore the blur event
            that.cancelBlur = true;
            utils.delay(function () {
                delete that.cancelBlur;
            });

            // clicking on the scrollbar causes focus to shift to the body
            // but we can't detect a mouseup or a click immediately afterward
            // so we have to track the next mousedown and close the menu if
            // the user clicks somewhere outside of the autocomplete
            if ($(e.target).closest(".ui-menu-item").length == 0) {
                utils.delay(function () {
                    $(document).one("mousedown", function (e) {
                        var $elements = that.el
                            .add(that.$wrapper)
                            .add(that.options.$helpers);

                        if (that.options.floating) {
                            $elements = $elements.add(that.$container);
                        }

                        $elements = $elements.filter(function () {
                            return this === e.target || $.contains(this, e.target);
                        });

                        if (!$elements.length) {
                            that.hide();
                        }
                    });
                });
            }
        },

        bindWindowEvents: function () {
            var that = this,
                handler = $.proxy(that.fixPosition, that);

            that.$viewport
                .on('resize' + eventNS + that.uniqueId, handler)
                .on('scroll' + eventNS + that.uniqueId, handler);
        },

        unbindWindowEvents: function () {
            this.$viewport
                .off('resize' + eventNS + this.uniqueId)
                .off('scroll' + eventNS + this.uniqueId);
        },

        scrollToTop: function () {
            var that = this,
                scrollTarget = that.options.scrollOnFocus;

            if (scrollTarget === true) {
                scrollTarget = that.el;
            }
            if (scrollTarget instanceof $ && scrollTarget.length > 0) {
                $('body,html').animate({
                    scrollTop: scrollTarget.offset().top
                }, 'fast');
            }
        },

        // Configuration methods

        setOptions: function (suppliedOptions) {
            var that = this;

            $.extend(that.options, suppliedOptions);

            that.type = types[that.options.type];
            if (!that.type) {
                that.disable();
                throw '`type` option is incorrect! Must be one of: ' + $.map(types, function (i, type) {
                    return '"' + type + '"';
                }).join(', ');
            }

            $(that.options.$helpers)
                .off(eventNS)
                .on('mousedown' + eventNS, $.proxy(that.onMousedown, that));

            that.notify('setOptions');
        },

        // Common public methods

        fixPosition: function (e) {
            var that = this,
                elLayout = {},
                wrapperOffset,
                origin;

            if (e && e.type == 'scroll' && !that.options.floating) return;
            that.$container.appendTo(that.options.floating ? that.$body : that.$wrapper);

            that.isMobile = that.$viewport.width() <= that.options.mobileWidth;

            that.notify('resetPosition');
            // reset input's padding to default, determined by css
            that.el.css('paddingLeft', '');
            that.el.css('paddingRight', '');
            elLayout.paddingLeft = parseFloat(that.el.css('paddingLeft'));
            elLayout.paddingRight = parseFloat(that.el.css('paddingRight'));

            $.extend(elLayout, that.el.offset());
            elLayout.borderTop = that.el.css('border-top-style') == 'none' ? 0 : parseFloat(that.el.css('border-top-width'));
            elLayout.borderLeft = that.el.css('border-left-style') == 'none' ? 0 : parseFloat(that.el.css('border-left-width'));
            elLayout.innerHeight = that.el.innerHeight();
            elLayout.innerWidth = that.el.innerWidth();
            elLayout.outerHeight = that.el.outerHeight();
            elLayout.componentsLeft = 0;
            elLayout.componentsRight = 0;
            wrapperOffset = that.$wrapper.offset();

            origin = {
                top: elLayout.top - wrapperOffset.top,
                left: elLayout.left - wrapperOffset.left
            };

            that.notify('fixPosition', origin, elLayout);

            if (elLayout.componentsLeft > elLayout.paddingLeft) {
                that.el.css('paddingLeft', elLayout.componentsLeft + 'px');
            }
            if (elLayout.componentsRight > elLayout.paddingRight) {
                that.el.css('paddingRight', elLayout.componentsRight + 'px');
            }
        },

        clearCache: function () {
            this.cachedResponse = {};
            this.enrichmentCache = {};
            this.badQueries = [];
        },

        clear: function () {
            var that = this;

            that.clearCache();
            that.currentValue = '';
            that.selection = null;
            that.hide();
            that.suggestions = [];
            that.el.val('');
            that.el.trigger('suggestions-clear');
            that.notify('clear');
        },

        disable: function () {
            var that = this;

            that.disabled = true;
            that.abortRequest();
            that.hide();
        },

        enable: function () {
            this.disabled = false;
        },

        isUnavailable: function () {
            return this.disabled;
        },

        update: function () {
            var that = this,
                query = that.el.val();

            if (that.isQueryRequestable(query)) {
                that.currentValue = query;
                that.updateSuggestions(query);
            } else {
                that.hide();
            }
        },

        setSuggestion: function (suggestion) {
            var that = this,
                data,
                value;

            if ($.isPlainObject(suggestion) && $.isPlainObject(suggestion.data)) {
                suggestion = $.extend(true, {}, suggestion);

                if (that.bounds.own.length) {
                    that.checkValueBounds(suggestion);
                    data = that.copyBoundedData(suggestion.data, that.bounds.all);
                    if (suggestion.data.kladr_id) {
                        data.kladr_id = that.getBoundedKladrId(suggestion.data.kladr_id, that.bounds.all);
                    }
                    suggestion.data = data;
                }

                value = that.getSuggestionValue(suggestion) || '';
                that.currentValue = value;
                that.el.val(value);
                that.selection = suggestion;
                that.suggestions = [suggestion];
                that.abortRequest();
            }
        },

        /**
         * Fetch full object for current INPUT's value
         * if no suitable object found, clean input element
         */
        fixData: function () {
            var that = this,
                fullQuery = that.extendedCurrentValue(),
                currentValue = that.el.val(),
                resolver = $.Deferred();

            resolver
                .done(function (suggestion) {
                    that.selectSuggestion(suggestion, 0, currentValue, { hasBeenEnriched: true });
                })
                .fail(function () {
                    that.selection = null;
                    that.currentValue = '';
                    that.el.val(that.currentValue);
                });

            if (that.isQueryRequestable(fullQuery)) {
                that.currentValue = fullQuery;
                that.getSuggestions(fullQuery, { count: 1, from_bound: null, to_bound: null })
                    .done(function (suggestions) {
                        // data fetched
                        var suggestion = suggestions[0];
                        if (suggestion) {
                            resolver.resolve(suggestion);
                        } else {
                            resolver.reject();
                        }
                    })
                    .fail(function () {
                        // no data fetched
                        resolver.reject();
                    });
            } else {
                resolver.reject();
            }
        },

        // Querying related methods

        /**
         * Looks up parent instances
         * @returns {String} current value prepended by parents' values
         */
        extendedCurrentValue: function () {
            var that = this,
                parentInstance = that.getParentInstance(),
                parentValue = parentInstance && parentInstance.extendedCurrentValue(),
                currentValue = $.trim(that.el.val());

            return utils.compact([parentValue, currentValue]).join(' ');
        },

        getAjaxParams: function (method, custom) {
            var that = this,
                token = $.trim(that.options.token),
                serviceUrl = that.options.serviceUrl,
                serviceMethod = serviceMethods[method],
                params = $.extend({
                    timeout: that.options.timeout
                }, serviceMethod.defaultParams),
                headers = {};

            if (!/\/$/.test(serviceUrl)) {
                serviceUrl += '/';
            }
            serviceUrl += method;
            if (serviceMethod.addTypeInUrl) {
                serviceUrl += '/' + that.type.urlSuffix;
            }

            serviceUrl = utils.fixURLProtocol(serviceUrl);

            if ($.support.cors) {
                // for XMLHttpRequest put token in header
                if (token) {
                    headers['Authorization'] = 'Token ' + token;
                }
                headers['X-Version'] = Suggestions.version;
                if (!params.headers) {
                    params.headers = {};
                }
                $.extend(params.headers, that.options.headers, headers);
            } else {
                // for XDomainRequest put token into URL
                if (token) {
                    headers['token'] = token;
                }
                headers['version'] = Suggestions.version;
                serviceUrl = utils.addUrlParams(serviceUrl, headers);
            }

            params.url = serviceUrl;

            return $.extend(params, custom);
        },

        isQueryRequestable: function (query) {
            var that = this,
                result;

            result = query.length >= that.options.minChars;

            if (result && that.type.isQueryRequestable) {
                result = that.type.isQueryRequestable.call(that, query);
            }

            return result;
        },

        constructRequestParams: function (query, customParams) {
            var that = this,
                options = that.options,
                params = $.isFunction(options.params)
                    ? options.params.call(that.element, query)
                    : $.extend({}, options.params);

            if (that.type.constructRequestParams) {
                $.extend(params, that.type.constructRequestParams.call(that));
            }
            $.each(that.notify('requestParams'), function (i, hookParams) {
                $.extend(params, hookParams);
            });
            params[options.paramName] = query;
            if ($.isNumeric(options.count) && options.count > 0) {
                params.count = options.count;
            }

            return $.extend(params, customParams);
        },

        updateSuggestions: function (query) {
            var that = this;

            that.fetchPhase = that.getSuggestions(query)
                .done(function (suggestions) {
                    that.assignSuggestions(suggestions, query);
                });
        },

        /**
         * Get suggestions from cache or from server
         * @param {String} query
         * @param {Object} customParams parameters specified here will be passed to request body
         * @param {Object} requestOptions
         *          - noCallbacks flag, request competence callbacks will not be invoked
         *          - useEnrichmentCache flag
         * @return {$.Deferred} waiter which is to be resolved with suggestions as argument
         */
        getSuggestions: function (query, customParams, requestOptions) {
            var response,
                that = this,
                options = that.options,
                noCallbacks = requestOptions && requestOptions.noCallbacks,
                useEnrichmentCache = requestOptions && requestOptions.useEnrichmentCache,
                params = that.constructRequestParams(query, customParams),
                cacheKey = $.param(params || {}),
                resolver = $.Deferred();

            response = that.cachedResponse[cacheKey];
            if (response && $.isArray(response.suggestions)) {
                resolver.resolve(response.suggestions);
            } else {
                if (that.isBadQuery(query)) {
                    resolver.reject();
                } else {
                    if (!noCallbacks && options.onSearchStart.call(that.element, params) === false) {
                        resolver.reject();
                    } else {
                        that.doGetSuggestions(params)
                            .done(function (response) {
                                // if response is correct and current value has not been changed
                                if (that.processResponse(response) && query == that.currentValue) {

                                    // Cache results if cache is not disabled:
                                    if (!options.noCache) {
                                        if (useEnrichmentCache) {
                                            that.enrichmentCache[query] = response.suggestions[0];
                                        } else {
                                            that.enrichResponse(response, query);
                                            that.cachedResponse[cacheKey] = response;
                                            if (options.preventBadQueries && response.suggestions.length === 0) {
                                                that.badQueries.push(query);
                                            }
                                        }
                                    }

                                    resolver.resolve(response.suggestions);
                                } else {
                                    resolver.reject();
                                }
                                if (!noCallbacks) {
                                    options.onSearchComplete.call(that.element, query, response.suggestions);
                                }
                            }).fail(function (jqXHR, textStatus, errorThrown) {
                                resolver.reject();
                                if (!noCallbacks && textStatus !== 'abort') {
                                    options.onSearchError.call(that.element, query, jqXHR, textStatus, errorThrown);
                                }
                            });
                    }
                }
            }
            return resolver;
        },

        /**
         * Sends an AJAX request to server suggest method.
         * @param {Object} params request params
         * @returns {$.Deferred} response promise
         */
        doGetSuggestions: function (params) {
            var that = this,
                request = $.ajax(
                    that.getAjaxParams('suggest', { data: utils.serialize(params) })
                );

            that.abortRequest();
            that.currentRequest = request;
            that.notify('request');

            request.always(function () {
                that.currentRequest = null;
                that.notify('request');
            });

            return request;
        },

        isBadQuery: function (q) {
            if (!this.options.preventBadQueries) {
                return false;
            }

            var result = false;
            $.each(this.badQueries, function (i, query) {
                return !(result = q.indexOf(query) === 0);
            });
            return result;
        },

        abortRequest: function () {
            var that = this;

            if (that.currentRequest) {
                that.currentRequest.abort();
            }
        },

        /**
         * Checks response format and data
         * @return {Boolean} response contains acceptable data
         */
        processResponse: function (response) {
            var that = this;

            if (!response || !$.isArray(response.suggestions)) {
                return false;
            }

            that.verifySuggestionsFormat(response.suggestions);
            that.setUnrestrictedValues(response.suggestions);

            return true;
        },

        verifySuggestionsFormat: function (suggestions) {
            if (typeof suggestions[0] === 'string') {
                $.each(suggestions, function (i, value) {
                    suggestions[i] = { value: value, data: null };
                });
            }
        },

        getSuggestionValue: function (suggestion) {
            var that = this,
                formatSelected = that.options.formatSelected || that.type.formatSelected,
                formattedValue;

            if ($.isFunction(formatSelected)) {
                formattedValue = formatSelected.call(that, suggestion);
            }

            if (typeof formattedValue !== 'string' || formattedValue.length == 0) {
                formattedValue = suggestion.value;
            }

            return formattedValue;
        },

        assignSuggestions: function (suggestions, query) {
            var that = this;
            that.suggestions = suggestions;
            that.notify('assignSuggestions', query);
        },

        shouldRestrictValues: function () {
            var that = this;
            // treat suggestions value as restricted only if there is one constraint
            // and restrict_value is true
            return that.options.restrict_value
                && that.constraints
                && Object.keys(that.constraints).length == 1;
        },

        /**
         * Fills suggestion.unrestricted_value property
         */
        setUnrestrictedValues: function (suggestions) {
            var that = this,
                shouldRestrict = that.shouldRestrictValues(),
                label = that.getFirstConstraintLabel();

            $.each(suggestions, function (i, suggestion) {
                suggestion.unrestricted_value = shouldRestrict ? label + ', ' + suggestion.value : suggestion.value;
            });
        },

        areSuggestionsSame: function (a, b) {
            return a && b &&
                a.value === b.value &&
                utils.areSame(a.data, b.data);
        }

    };

//include "element.js"

//include "status.js"

//include "geolocation.js"

//include "enrich.js"

//include "container.js"

//include "addon.js"

//include "constraints.js"

//include "select.js"

//include "bounds.js"

    // Create chainable jQuery plugin:
    $.fn.suggestions = function (options, args) {
        // If function invoked without argument return
        // instance of the first matched element:
        if (arguments.length === 0) {
            return this.first().data(dataAttrKey);
        }

        return this.each(function () {
            var inputElement = $(this),
                instance = inputElement.data(dataAttrKey);

            if (typeof options === 'string') {
                if (instance && typeof instance[options] === 'function') {
                    instance[options](args);
                }
            } else {
                // If instance already exists, destroy it:
                if (instance && instance.dispose) {
                    instance.dispose();
                }
                instance = new Suggestions(this, options);
                inputElement.data(dataAttrKey, instance);
            }
        });
    };

}));
