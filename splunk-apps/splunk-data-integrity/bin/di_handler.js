const path = require('path');
const { Endpoint } = require('splunk-rest-ipc');
const { getParam } = require('./request_utils');
const co = require('co');
const fs = require('fs');
const EthHandler = require('./ethereum');
const exec = require('node-exec-promise').exec;
const parse = require('parse-key-value');
const splunkjs = require('splunk-sdk');
const merge = require('deepmerge');

let ledgerHandler;
const splunkBin = path.join(process.env.SPLUNK_HOME, 'bin', 'splunk')

// Handles a single bucket check 
function handleBucketRequest(request) {
    const index = getParam(request, 'index');
    const bucketPath = getParam(request, 'path');
    const bucket = path.basename(bucketPath);
    let remoteIndex
    const bucketId = getParam(request, 'bucketid');
    let localHash = readLocalHash(bucketPath);

    const localCheck = new Promise((resolve, reject) => {
        exec(
            `${splunkBin} check-integrity -bucketPath ${bucketPath}`
        ).then(
            (out) => {
                // Splunk all ways returns output on stderr for this command
                resolve(parse(out.stderr.replace(/\n|,/g, ';')));
            },
            (err) => {
                console.error(`ERROR CheckIntegrity failed running splunk check-integrity ${err}\n`)
                reject(err);
            }
        );
    });

    const remoteCheck = new Promise((resolve, reject) => {
        var service = new splunkjs.Service({ sessionKey: request.session.authtoken });
        initLedgerHandler(service).then(function () {
            getLedgerIndexName(service, index).then(ledgerIndex => {
                remoteIndex = ledgerIndex;
                ledgerHandler.getBucketHash(ledgerIndex, bucket).then((value) => {
                    resolve(value);
                }, (err) => {
                    console.error(`ERROR CheckIntegrity failed to getBucketHash ${err}\n`);
                    reject(err)
                });
            });
        }, (err) => {
            console.error(`ERROR CheckIntegrity failed ${err}`)
            reject(err)
        });
    });

    return Promise.all([localCheck, remoteCheck]).then(values => ({
        payload: {
            entry: [
                {
                    content: {
                        index,
                        remoteIndex,
                        bucket,
                        bucketId: bucketId,
                        localHash: localHash,
                        localCheck: values[0],
                        remoteHash: values[1]
                    }
                }
            ]
        }
    }));
}


// Handles a batch request for all buckets of an index
function handleIndexRequest(request) {
    const index = getParam(request, 'index');
    let remoteIndex;
    var service = new splunkjs.Service({ sessionKey: request.session.authtoken });
    const remoteCheck = new Promise((resolve, reject) => {
        initLedgerHandler(service).then(function () {
            getLedgerIndexName(service, index).then(ledgerIndex => {
                ledgerHandler.getIndexHashes(ledgerIndex).then((value) => {
                    resolve(value);
                }, (err) => {
                    console.error(`ERROR CheckIntegrity failed to getIndexHashes ${err}\n`);
                    reject(err)
                });
            })
        }, (err) => {
            console.error(`ERROR CheckIntegrity failed ${err}`)
            reject(err)
        });
    });


    const localCheck = new Promise((resolve, reject) => {
        exec(
            `${splunkBin} check-integrity -index ${index}`
        ).then((out) => {
            let buckets = parseCheckIntegrityCLI(out);
            Object.keys(buckets).map(function (bucket) {
                buckets[bucket].localHash = readLocalHash(buckets[bucket].bucketPath)
            })
            resolve(buckets);
        }, (err) => {
            console.error(`ERROR CheckIntegrity failed running splunk check-integrity ${err}\n`)
            reject(err);
        });
    });

    return Promise.all([localCheck, remoteCheck]).then((values) => {
        const results = updateStatus(merge(values[0], values[1]))
        return {
            payload: {
                entry: Object.keys(results).map(function (key) {
                    let content = results[key]
                    content.bucket = key;
                    content.index = index;
                    content.remoteIndex = remoteIndex;
                    return { 'content': content }
                })
            }
        }

    });
}

function parseCheckIntegrityCLI(out) {
    // Splunk all ways returns output on stderr for this command
    out = out.stderr.toString().split('Operating on: ');
    // Ignore bogus first line
    let outputRex = /idx=(.*) bucket='(.*)'/
    let reasonRex = /Reason=(.*)/
    let buckets = {};
    out.map(function (result) {
        var bucket_parsed = outputRex.exec(result)
        var reason_parsed = reasonRex.exec(result)

        if (bucket_parsed) {

            buckets[path.basename(bucket_parsed[2])] = {
                // If no reason is supplied check passed
                bucketPath: bucket_parsed[2],
                localCheck: reason_parsed ? 0 : 1,
                reason: reason_parsed != null ? reason_parsed[1] : ''
            }
        }
    })
    return buckets
}

function handleSubmitRequest(request) {
    const indexName = getParam(request, 'index');
    const bucketName = getParam(request, 'bucket');
    const hash = getParam(request, 'hash');
    var service = new splunkjs.Service({ sessionKey: request.session.authtoken });
    return initLedgerHandler(service).then(function () {
        return getLedgerIndexName(service, indexName).then(ledgerIndex => {
            return ledgerHandler.putBucketHash(ledgerIndex, bucketName, hash).then((value) => {
                return {
                    payload: {
                        entry: {
                            content: `event=hashSubmitted watchedIndex=${indexName} hash=${hash} bucket=${bucketName} transactionId=${value}`
                        }
                    }
                }
            }, (err) => {
                console.error(`ERROR CheckIntegrity event=hashSubmitFailed watchedIndex=${indexName} hash=${hash} bucket=${bucketName} error=${err}\n`)
                return {
                    payload: {
                        entry: {
                            content: `event=hashSubmitFailed watchedIndex=${indexName} hash=${hash} bucket=${bucketName} error=${err}`
                        }
                    }
                }
            });
        });
    });
}

function readLocalHash(bucketPath) {
    let localHash = "not found";
    try {
        var hashFiles = fs.readdirSync(path.join(bucketPath, 'rawdata')).filter(fn => fn.endsWith('.dat') && fn.startsWith('l2Hash_'));
        if (hashFiles.length > 0) {
            localHash = fs
                .readFileSync(path.join(bucketPath, 'rawdata', hashFiles[0]))
                .toString('base64');
        }
    } catch (error) {
        console.error(`ERROR CheckIntegrity failed to read localhash  bucket=${bucketPath} error=${error}`);
    }
    return localHash;
}

function updateStatus(buckets) {
    Object.keys(buckets).map(function (bucket) {
        buckets[bucket].unknown = 0;
        buckets[bucket].hashMismatch = 0;
        if (!buckets[bucket].localHash || (buckets[bucket].localHash && buckets[bucket].localHash === 'not found')) {
            if (!buckets[bucket].remoteHash) {
                buckets[bucket].integrityCheck = 'Unknown';
                buckets[bucket].localCheck = 1;
                buckets[bucket].ledgerCheck = 1;
                buckets[bucket].unknown = 1;
            } else {
                buckets[bucket].integrityCheck = 'Deleted'
                buckets[bucket].ledgerCheck = 1;
                buckets[bucket].localCheck = 1;
            }
        }
        if (!buckets[bucket].remoteHash && buckets[bucket].integrityCheck != 'Unknown') {
            buckets[bucket].ledgerCheck = 0;
            buckets[bucket].integrityCheck = 'Failed';
        } else {
            buckets[bucket].ledgerCheck = 1;
        }
        if (buckets[bucket].localHash && buckets[bucket].remoteHash) {
            if (buckets[bucket].localHash != buckets[bucket].remoteHash) {
                buckets[bucket].hashMismatch = 1;
                buckets[bucket].integrityCheck = 'Failed'
            } else {
                if (buckets[bucket].localCheck) {
                    buckets[bucket].integrityCheck = 'Passed'
                } else {
                    buckets[bucket].integrityCheck = 'Failed'
                }
            }
        }
        buckets[bucket].remoteHash = buckets[bucket].remoteHash ? buckets[bucket].remoteHash : 'not found';
        buckets[bucket].localHash = buckets[bucket].localHash ? buckets[bucket].localHash : 'not found';
    })
    return buckets;
}

function getLedgerIndexName(service, index) {
    return new Promise(function (resolve, reject) {
        service.indexes().fetch(function (err, indexes) {
            if (err) {
                console.error(`ERROR CheckIntegrity failed to get index properties error=${err}`);
                reject(err)
            }
            let dbPath = indexes.item(index).properties().homePath_expanded
            let remoteIndex = path.basename(path.dirname(dbPath));
            resolve(remoteIndex)
        });
    });
}

function initLedgerHandler(service) {
    return new Promise(function (resolveConfig, rejectConfig) {
        var config = service.configurations({ owner: "nobody", app: "splunk-data-integrity" })
        if (ledgerHandler != null) {
            resolveConfig();
        } else {
            config.fetch(function (err, _) {
                if (err) {
                    console.error(`ERROR CheckIntegrity failed to get splunk config ${err}\n`);
                    rejectConfig(err);
                }
                config.item("dataintegritysetup").fetch(function (err, result) {
                    if (err) {
                        console.error(`ERROR CheckIntegrity failed to get dataintegritysetup config ${err}\n`);
                        rejectConfig(err);
                    }
                    var props = result.list()[0].properties();
                    ledgerHandler = new EthHandler(props);
                    ledgerHandler.connect().then(() => {
                        resolveConfig();
                    }, (err) => {
                        console.error(`ERROR CheckIntegrity failed to connect ${err}\n`);
                        rejectConfig(err);
                    })
                });
            });
        }
    });
}


process.on('uncaughtException', (err) => {
    console.error(`ERROR CheckIntegrity event=unhandledException message=${err.message}\n`)
})

const endpoint = Endpoint.create((endpoint) => {
    endpoint.GET('/bucket', request => co(handleBucketRequest(request)));
    endpoint.GET('/index', request => co(handleIndexRequest(request)));
    endpoint.POST('/submit', request => co(handleSubmitRequest(request)))
});

module.exports = endpoint;
