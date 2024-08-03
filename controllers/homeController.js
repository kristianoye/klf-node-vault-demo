const
    BaseController = require('../src/baseController');

/**
 * Handle requests for the home page
 */
class HomeController extends BaseController {
    /**
     * @param {import('../src/baseController').ControllerSettings} settings Controller settings
     * @param {import('../src/vault/vaultClient')} vault Injected vault client
     */
    constructor(settings, vault) {
        super(settings);
        this.vault = vault;
    }

    /**
     * Serve the landing page
     * @returns 
     */
    async get() {
        await this.renderAsync({ pageTitle: 'Pechanga Demo' });
    }
}

module.exports = HomeController;
