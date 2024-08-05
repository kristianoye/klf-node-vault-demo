/*
 *  Demo server entry point
 *  Written by Kristian Oye <kristianoye@gmail.com>
 */
(async () => {
    const
        Application = require('./src/application'),
        { Lifespan } = require('./src/dicontainer'),
        settings = {
            rootDirectory: __dirname
        };

    const app = new Application(settings)
        .on('initcontainer',
            /**
             * Initialize the DI container, let's set up the Vault client when requested
             * @param {{ container: import('./src/dicontainer').DIContainer}} initData 
             */
            async ({ container } = initData) => {
                container.register('vault', {
                    module: '@node-vault',
                    lifespan: Lifespan.Lifetime,
                    builder: async (req) => {
                        const
                            endpointData = app.config.getValue('vault.clientSettings', false),
                            loginClient = req.module(endpointData),
                            roleData = process.env.VAULT_ROLE,
                            role = JSON.parse(roleData),
                            authInfo = await loginClient.approleLogin(role),
                            authToken = authInfo.auth.client_token,
                            settings = { ...endpointData, ...role, token: authToken },
                            /** @type {import('node-vault').client} */
                            authorizedClient = req.module(settings);

                        return authorizedClient;

                    }
                })
            });

    await app.run();
})();
