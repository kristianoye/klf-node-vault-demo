const
    BaseController = require('../../src/baseController');

/**
 * Handle requests for the admin tab
 */
class AdminController extends BaseController {
    /**
     * @param {import('../../src/baseController').ControllerSettings} settings Controller settings
     * @param {import('node-vault').client} vault Injected vault client
     */
    constructor(settings, vault) {
        super(settings);
        this.vault = vault;
    }

    /**
     * Get a list of all users
     * Possible responses:
     *   - 200 with list of names
     *   - 204 good response, no users
     *   - 500 backend error with message
     * @returns {{ code: number, message: string, userList: string[] }}
     */
    async getUsers() {
        try {
            const userListPath = 'kv/metadata/pechenga/users',
                userListResponse = await this.vault.list(userListPath),
                userList = userListResponse.data?.keys || [],
                hasUsers = userList.length > 0;

            this.response.json({
                code: hasUsers ? 200 : 204 /* no content */,
                message: 'OK',
                userList
            });
        }
        catch (err) {
            this.response.json({
                code: 500,
                message: 'Error',
                userList: [],
                error: err.message || err
            });
        }
    }

    /**
     * Get data for a specific user
     * Possible responses:
     *   - 200 user account info
     *   - 404 user not found
     *   - 500 backend error with message
     * @returns {{ code: number, message: string, userList: string[] }}
     */
    async getUser(name) {
        try {
            const getUserPath = `kv/data/pechenga/users/${name}`,
                userResponse = await this.vault.read(getUserPath),
                userData = {
                    code: 200,
                    message: 'OK',
                    user: { username: name, ...userResponse.data.data }
                };

            this.response.json(userData);
        }
        catch (err) {
            const code = err.response?.statusCode || 500;

            this.response.json({
                //  Pass Vault statusCode back if available
                code,
                error: code === 404 ? 'User not found' : err.message || 'Error',
                message: 'Error',
                user: {}
            });
        }
    }
}

module.exports = AdminController;
