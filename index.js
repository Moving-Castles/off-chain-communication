const { v4: uuidv4 } = require('uuid');
const uWS = require('uWebSockets.js');
const ethereumjsUtil = require('ethereumjs-util');
const { keccak256 } = require('js-sha3');

const app = uWS.App();

const port = 9001;
let clients = [];
let verifiedClients = []

// Function to recover the Ethereum address from a given signature and message
function recoverAddress(signature, message) {
    // Convert the message to a Keccak-256 hash
    const messageHash = new Uint8Array(keccak256.buffer(message));

    // Decompose the given signature into its components: v, r, and s
    const { v, r, s } = ethereumjsUtil.fromRpcSig(signature);

    // Recover the public key from the message hash and signature components
    const pub = ethereumjsUtil.ecrecover(messageHash, v, r, s);

    // Convert the recovered public key to an Ethereum address
    const addrBuf = ethereumjsUtil.pubToAddress(pub);

    // Convert the address from a buffer to a hex string format
    const recoveredAddress = ethereumjsUtil.bufferToHex(addrBuf);

    console.log('Recovered address:', recoveredAddress)

    // Return the recovered Ethereum address as a hex string
    return recoveredAddress;
}

function pushToAll(data) {
    for (let i = 0; i < clients.length; i++) {
        clients[i].send(JSON.stringify(data));
    }
}

app.ws('/*', {
    /* Options */
    compression: 0,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,

    /* Handlers */
    open: (ws) => {
        ws.subscribe('broadcast');
        ws.id = uuidv4();
        clients.push(ws);
        console.log("§ id: ", ws.id)
    },
    message: (ws, message, isBinary) => {
        const messageObj = JSON.parse(Buffer.from(message).toString())

        if (messageObj.topic === 'verify') {
            const recoveredAddress = recoverAddress(messageObj.data.signature, "\x19Ethereum Signed Message:\n" + "2" + "mc")
            verifiedClients.push({
                id: ws.id,
                address: recoveredAddress
            })
            pushToAll({ topic: "verifiedClients", verifiedClients: verifiedClients })
        } else {
            pushToAll({ topic: "chat", data: messageObj.data })
            // ws.publish('broadcast', message, isBinary);
        }
    },
    close: (ws, code, message) => {
        clients = clients.filter(client => client !== ws);
        verifiedClients = verifiedClients.filter(client => client.id !== ws.id);
        pushToAll({ topic: "verifiedClients", verifiedClients: verifiedClients })
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