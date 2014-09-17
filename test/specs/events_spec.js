
describe('Element events', function () {
    'use strict';

    var serviceUrl = '/some/url';

    beforeEach(function () {
        this.input = document.createElement('input');
        this.$input = $(this.input).appendTo('body');
        this.instance = this.$input.suggestions({
            serviceUrl: serviceUrl,
            type: 'NAME'
        }).suggestions();

        this.server = sinon.fakeServer.create();
    });

    afterEach(function () {
        this.instance.dispose();
        this.$input.remove();
        this.server.restore();
    });

    it('`suggestions-select` should be triggered', function () {
        var suggestion = { value: 'A', data: 'B' },
            eventArgs = [];

        this.$input.on('suggestions-select', function (e, sug) {
            eventArgs.push(sug);
        });

        this.input.value = 'A';
        this.instance.onValueChange();
        this.server.respond(helpers.responseFor([suggestion]));
        this.instance.select(0);

        expect(eventArgs).toEqual([helpers.appendUnrestrictedValue(suggestion)]);
    });

    it('`suggestions-selectnothing` should be triggered', function () {
        var eventArgs = [];

        this.$input.on('suggestions-selectnothing', function (e, val) {
            eventArgs.push(val);
        });

        this.instance.selectedIndex = -1;

        this.input.value = 'A';
        this.instance.onValueChange();
        helpers.hitEnter(this.input);

        expect(eventArgs).toEqual(['A']);
    });

    it('`suggestions-invalidateselection` should be triggered', function () {
        var suggestion = { value: 'A', data: 'B' },
            eventArgs = [];

        this.$input.on('suggestions-invalidateselection', function (e, val) {
            eventArgs.push(val);
        });

        this.input.value = 'A';
        this.instance.onValueChange();
        this.server.respond(helpers.responseFor([suggestion]));
        this.instance.select(0);

        this.input.value = 'Aaaa';
        this.instance.onValueChange();
        helpers.hitEnter(this.input);

        expect(eventArgs).toEqual([helpers.appendUnrestrictedValue(suggestion)]);
    });

});