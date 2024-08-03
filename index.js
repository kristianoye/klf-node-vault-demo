
/*
 *  Demo server entry point
 *  Written by Kristian Oye <kristianoye@gmail.com>
 */
(async() => {
    const 
        Application = require('./src/application'),
        path = require('node:path'),
        settings = {
            rootDirectory: __dirname
        };

    const app = new Application(settings);
    await app.run();
})();
