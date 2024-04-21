const { v4: uuidv4 } = require('uuid');
const uWS = require('uWebSockets.js');
const ethereumjsUtil = require('ethereumjs-util');
const { keccak256 } = require('js-sha3');
const sqlite3 = require('sqlite3').verbose();

const app = uWS.App();
const port = 4000;
let clients = [];
let verifiedClients = [];

const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the in-memory SQlite database.');
});

// Create a table to store chat messages
db.run(`
    CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        world TEXT,
        timestamp INTEGER,
        address TEXT,
        name TEXT,
        message TEXT
    )
`);

function recoverAddress(signature, message) {
    const messageHash = new Uint8Array(keccak256.buffer(message));
    const { v, r, s } = ethereumjsUtil.fromRpcSig(signature);
    const pub = ethereumjsUtil.ecrecover(messageHash, v, r, s);
    const addrBuf = ethereumjsUtil.pubToAddress(pub);
    const recoveredAddress = ethereumjsUtil.bufferToHex(addrBuf);
    console.log('Recovered address:', recoveredAddress);
    return recoveredAddress;
}

function pushToAll(data) {
    for (let i = 0; i < clients.length; i++) {
        clients[i].send(JSON.stringify(data));
    }
}

function sendRecentMessages(ws) {
    db.all(`
        SELECT id, world, timestamp, address, name, message 
        FROM messages 
        ORDER BY timestamp DESC 
        LIMIT 20
    `, [], (err, rows) => {
        if (err) {
            throw err;
        }
        // Send each message individually to the newly connected client
        rows.reverse().forEach((row) => {
            ws.send(JSON.stringify({ topic: "chat", data: row }));
        });
    });
}

app.ws('/*', {
    compression: 0,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,

    open: (ws) => {
        ws.subscribe('broadcast');
        ws.id = uuidv4();
        clients.push(ws);
        sendRecentMessages(ws);
        console.log("New client id: ", ws.id);
    },

    message: (ws, message, isBinary) => {
        const messageObj = JSON.parse(Buffer.from(message).toString());

        if (messageObj.topic === 'verify') {
            const recoveredAddress = recoverAddress(messageObj.data.signature, "\x19Ethereum Signed Message:\n" + "2" + "mc");
            verifiedClients.push({
                id: ws.id,
                address: recoveredAddress
            });
            pushToAll({ topic: "verifiedClients", verifiedClients: verifiedClients });
        } else {
            db.run(`
                INSERT INTO messages (id, world, timestamp, address, name, message) 
                VALUES (?, ?, ?, ?, ?, ?)
            `, [messageObj.data.id, messageObj.data.world, messageObj.data.timestamp, messageObj.data.address, messageObj.data.name, messageObj.data.message], function (err) {
                if (err) {
                    return console.log(err.message);
                }
                console.log(`A row has been inserted with rowid ${this.lastID}`);
            });
            pushToAll({ topic: "chat", data: messageObj.data });
        }
    },

    close: (ws, code, message) => {
        clients = clients.filter(client => client !== ws);
        verifiedClients = verifiedClients.filter(client => client.id !== ws.id);
        pushToAll({ topic: "verifiedClients", verifiedClients: verifiedClients });
    }
}).any('/*', (res, req) => {
    res.end('Nothing to see here!');
}).listen(port, (token) => {
    if (token) {
        console.log('Listening to port ' + port);
    } else {
        console.log('Failed to listen to port ' + port);
    }
});
