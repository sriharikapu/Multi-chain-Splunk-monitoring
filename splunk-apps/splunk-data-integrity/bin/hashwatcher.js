const path = require('path');
require('log-timestamp');
const watch = require('node-watch');
const EthHandler = require('./ethereum');
const fs = require('fs');
const session = fs.readFileSync('/dev/stdin').toString();
const SPLUNK_HOME = process.env.SPLUNK_HOME || '/opt/splunk';
const SPLUNK_DB = process.env.SPLUNK_DB || path.join(SPLUNK_HOME, 'var/lib/splunk');
const splunkjs = require('splunk-sdk');

let ledgerHandler;

var getConfig = function getConfig() {
    return new Promise((resolve, reject) => {
        var service = new splunkjs.Service({ sessionKey: session });
        var config = service.configurations({ owner: "nobody", app: "splunk-data-integrity" })
        config.fetch(function (err, _) {
            if (err) {
                console.log(`ERROR Hashwatcher event=splunkConfigFailed message=error fetching splunk config error=${err}\n`);
                reject(err);
            }
            config.item("dataintegritysetup").fetch(function (err, result) {
                if (err) {
                    console.log(`ERROR Hashwatcher event=dataIntegrityConfigFailed message=error fetching dataintegrity config error=${err}\n`)
                    reject(err)
                }
                if (result.list().length > 0) {
                    resolve(result.list()[0].properties())
                } else {
                    console.log(`ERROR Hashwatcher event=dataIntegrityConfigFailed message=dataintegrity config missing props\n`)
                    reject()
                }
            });
        })
    })
}

var connectToEth = function connectToEth(props) {
    return new Promise((resolve, reject) => {
        ledgerHandler = new EthHandler(props);
        ledgerHandler.connect().then(() => {
            if (ledgerHandler.globalTunnel.proxyConfig) {
                console.log(`INFO Hashwatcher Connecting Using Proxy ${JSON.stringify(ledgerHandler.globalTunnel.proxyConfig)}\n`);
            } else {
                console.log('INFO Hashwatcher http_proxy or https_proxy unset Connecting Directly\n')
            }
            resolve();
        }, (err) => {
            if (ledgerHandler.globalTunnel.proxyConfig) {
                console.log(`ERROR Hashwatcher event=connectToEthFailed message=connection failed while attempting direct connection http_proxy or https_proxy unset error=${err}\n`)
            } else {
                console.log(`ERROR Hashwatcher event=connectToEthFailed message=connection failed using proxy ${JSON.stringify(ledgerHandler.globalTunnel.proxyConfig)} error=${err}\n`)
            }
            reject(err);
        });
    });
}

var submitLastHashes = function submitLastHashes() {
    return new Promise((resolve) => {
        // Check for missed buckets
        // list index folders
        const indexFolders = fs.readdirSync(path.join(SPLUNK_DB)).filter(indexFolder =>
            fs.statSync(path.join(SPLUNK_DB, indexFolder)).isDirectory() && fs.existsSync(path.join(SPLUNK_DB, indexFolder, 'db'))
        );

        console.log(`INFO Hashwatcher event=indexFoldersFoundOnStartUp indexFolders=${indexFolders}\n`)
        // list last bucket
        const buckets = indexFolders.map(indexFolder => {
            var bucket = fs.readdirSync(path.join(SPLUNK_DB, indexFolder, 'db')).filter(bucketFolder =>
                fs.statSync(path.join(SPLUNK_DB, indexFolder, 'db', bucketFolder)).isDirectory &&
                bucketFolder.indexOf('db_') > -1 &&
                bucketFolder.indexOf('rbsentinel') === -1
            ).pop()
            if (bucket) {
                return path.join(SPLUNK_DB, indexFolder, 'db', bucket)
            } else return undefined
        })

        console.log(`INFO Hashwatcher event=bucketsFoundOnStartUp buckets=${buckets}\n`)

        // attempt to send hash that maybe got missed during splunk restart
        buckets.forEach(bucketFolder => {
            if (bucketFolder && fs.existsSync(path.join(bucketFolder, 'rawdata'))) {
                fs.readdirSync(path.join(bucketFolder, 'rawdata')).forEach(rawFile => {
                    if (
                        rawFile.indexOf('l2Hash') > -1 &&
                        rawFile.indexOf('.tmp') === -1 &&
                        rawFile.indexOf('hot_') === -1
                    ) {
                        getSendHash(path.join(bucketFolder, 'rawdata', rawFile))
                    }
                })
            }
        })
        resolve();
    });
}

var watchForNewHashes = function watchForNewHashes() {
    // Watch Existing Indexes for new hashes
    fs.readdirSync(SPLUNK_DB).forEach((filename) => {
        var indexName = path.join(SPLUNK_DB, filename);
        if (fs.existsSync(indexName) && fs.statSync(indexName).isDirectory()) {
            indexWatcher(indexName);
        }
    });

    var watcher = watch(SPLUNK_DB, { recursive: false }, (evt, indexName) => {
        if (evt == 'update') {
            if (fs.existsSync(indexName) && fs.statSync(indexName).isDirectory()) {
                indexWatcher(indexName);
            }
        }
    })
    watcher.on('error', (error) => {
        console.log(`ERROR Hashwatcher event=indexWatcher error=${error}`);
    });
}

var indexWatcher = function (index) {
    if (fs.existsSync(path.join(index, 'db'))) {
        console.log(`INFO Hashwatcher event=watching ${path.join(index, 'db')}`);
        var watcher = watch(path.join(index, 'db'), { recursive: false, filter: /.*\/db_\d+_\d+_\d+.*$/ }, (evt, bucketName) => {
            if (evt == 'update' && !bucketName.endsWith('-tmp') && !bucketName.endsWith('rbsentinel')) {
                if (fs.statSync(path.join(bucketName, 'rawdata')).isDirectory()) {
                    var l2Hash = fs.readdirSync(path.join(bucketName, 'rawdata')).filter(file => file.match(/l2Hash.*dat$/));
                    if (l2Hash.length > 0) {
                        getSendHash(path.join(bucketName, 'rawdata', l2Hash[0]));
                    } else {
                        console.log(`INFO Hashwatcher event=missingL2 bucket=${bucketName} message=hashwatcher found new bucket without and l2Hash file`);
                    }
                }
            }
        })
        watcher.on('error', (error) => {
            console.log(`ERROR Hashwatcher event=indexWatcher watchedIndex=${index} error=${error}`);
        });
    }
}

function getSendHash(filename) {
    fs.readFile(filename, (err, data) => {
        if (err) {
            console.log(`ERROR Hashwatcher event=errorReadingHash error=${err}\n`);
        }
        const bucketName = path
            .dirname(filename)
            .split(path.sep)
            .slice(-2)[0];
        const indexName = path
            .dirname(filename)
            .split(path.sep)
            .slice(-4)[0];
        const hash = Buffer.from(data).toString('base64');
        console.log(
            `INFO Hashwatcher event=hashFound bucket=${bucketName} watchedIndex=${indexName} hash=${hash}`
        );
        ledgerHandler.getBucketHash(indexName, bucketName).then((existingHash) => {
            if (existingHash === 'not found') {
                console.log(`INFO Hashwatch event=submittingHash watchedIndex=${indexName} bucket=${bucketName} hash=${hash}\n`)
                ledgerHandler.putBucketHash(indexName, bucketName, hash).then((value) => {
                    console.log(`INFO Hashwatcher event=hashSubmitted watchedIndex=${indexName} hash=${hash} bucket=${bucketName} transactionId=${value}\n`);
                }, (err) => {
                    console.log(`ERROR Hashwatcher event=hashSubmitFailed watchedIndex=${indexName} hash=${hash} bucket=${bucketName} error=${err}\n`)
                });
            } else {
                console.log(`INFO Hashwatcher event=hashSkipped watchedIndex=${indexName} bucket=${bucketName} message=hash already exists ${existingHash}\n`)
            }
        }, (err) => {
            console.log(`ERROR Hashwatcher event=putHashFailed watchedIndex=${indexName} bucket=${bucketName} message=error attempting to retrieve existing hash error=${err}\n`);
        });
    });
}

process.on('uncaughtException', (err) => {
    console.log(`ERROR Hashwatcher event=unhandled exception message=${err.message}\n`)
});


getConfig()
    .then(connectToEth)
    .then(submitLastHashes)
    .then(watchForNewHashes);

// Keep it running
process.stdin.resume();
