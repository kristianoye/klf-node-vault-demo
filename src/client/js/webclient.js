const PechangaClient = (function($) {
    class PechangaClient {
        /**
         * 
         * @param {HTMLElement} rootElement The root element
         */
        constructor(rootElement) {
            this.$root = $(rootElement);
    
        }

        render() {
            this.$root.find('#tabs').tabs();
        }
    }

    return PechangaClient;
})(jQuery);
