var Web3 = require('web3');
var XHR2 = require('xhr2-cookies').XMLHttpRequest // jshint ignore: line
var http = require('http');
var https = require('https');


/**
 * HttpProvider should be used to send rpc calls over http
 */
var HttpProxyProvider = function HttpProxyProvider(host, options) {
    options = options || {};
    this.host = host || 'http://localhost:8545';
    if (this.host.substring(0,5) === "https"){
        this.httpsAgent = https.globalAgent;
        this.httpsAgent.keepAlive = true;
    }else{
        this.httpAgent = http.globalAgent;
        this.httpAgent.keepAlive = true;
    }
    this.timeout = options.timeout || 0;
    this.headers = options.headers;
    this.connected = false;
};

HttpProxyProvider.prototype = new Web3.providers.HttpProvider();

HttpProxyProvider.prototype._prepareRequest = function(){
    var request = new XHR2();
    request.nodejsSet({
        httpsAgent:this.httpsAgent,
        httpAgent:this.httpAgent
    });

    request.open('POST', this.host, true);
    request.setRequestHeader('Content-Type','application/json');
    request.timeout = this.timeout && this.timeout !== 1 ? this.timeout : 0;
    request.withCredentials = true;

    if(this.headers) {
        this.headers.forEach(function(header) {
            request.setRequestHeader(header.name, header.value);
        });
    }

    return request;
};


module.exports = HttpProxyProvider;