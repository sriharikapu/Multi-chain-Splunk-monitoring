(function () {
    var splunkjs = require("splunk-sdk");
    var ModularInputs = splunkjs.ModularInputs;
    var Logger = ModularInputs.Logger;
    var Event = ModularInputs.Event;
    var Scheme = ModularInputs.Scheme;
    var Argument = ModularInputs.Argument;
    const WebSocket = require('ws');

    // getScheme method returns introspection scheme
    exports.getScheme = function () {
        var scheme = new Scheme("Ethereum Stats Modular Input");

        // scheme properties
        scheme.description = "A modular input that recieves stats data from geth nodes";
        scheme.useExternalValidation = true;  // if true, must define validateInput method
        scheme.useSingleInstance = false;      // if true, all instances of mod input passed to
        //   a single script instance; if false, user 
        scheme.args = [
            new Argument({
                name: "port",
                dataType: Argument.dataTypeNumber,
                description: "Port number that the stats websocket will listen on.",
                requiredOnCreate: true,
                requiredOnEdit: false
            }),
            new Argument({
                name: "secret",
                dataType: Argument.dataTypeString,
                description: "Secret that the stats websocket will use for clients.",
                requiredOnCreate: true,
                requiredOnEdit: false
            })
        ];

        return scheme;
    };

    // validateInput method validates the script's configuration (optional)
    exports.validateInput = function (definition, done) {
        // local variables here
        var port = parseInt(definition.parameters.port, 10);
        var secret = definition.parameters.secret;

        // error checking goes here
        if (port < 0) {
            done(new Error("The port must be a positive number."));
        } else if (secret == ""){
            done(new Error("Secret must be set."))
        }
        else {
            done();
        }
    };

    // streamEvents streams the events to Splunk Enterprise
    exports.streamEvents = function (name, singleInput, eventWriter, done) {
        // Listen for websocket connections
        const wss = new WebSocket.Server({ port: singleInput.port });

        wss.on('connection', function connection(ws, req) {
            const ip = req.connection.remoteAddress.split(":").pop();
            ws.on('message', function incoming(message) {
                message = JSON.parse(message);
                var curEvent = new Event({
                    stanza: name,
                    data: Object.assign({"type":message.emit[0]},message.emit[1]),
                    host: ip
                });
                
                try {
                    eventWriter.writeEvent(curEvent);
                } catch (e) {
                    Logger.error(name, e.message);
                }
                switch (message.emit[0]) {
                    case 'hello':
                        if (message.emit[1].secret == singleInput.secret) {
                            ws.send('{"emit":["ready"]}');
                        }
                        break;
                    case 'node-ping':
                        ws.send(`{"emit":["node-pong",{"clientTime":"${Date.now()}"}]}`);
                        break;
                }
            });
        });

    };
    ModularInputs.execute(exports, module);
})();