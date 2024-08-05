const
    BaseController = require('../../src/baseController');

/**
 * Handle requests for the home page
 */
class UserController extends BaseController {
    /**
     * @param {import('../../src/baseController').ControllerSettings} settings Controller settings
     * @param {import('node-vault').client} vault Injected vault client
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
        const userList = 'v1/kv/data/pechenga/users';

        await this.renderAsync({ pageTitle: 'Pechanga Demo' });
    }
}

module.exports = UserController;
