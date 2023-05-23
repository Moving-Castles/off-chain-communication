/* Simple pub/sub broadcasting example */
const { v4: uuidv4 } = require('uuid');
const uWS = require('uWebSockets.js');
const web3 = require('web3');
const ethereumjsUtil = require('ethereumjs-util');
const app = uWS.App();

const port = 9001;
let clients = [];
let verifiedClients = []

function recoverAddress(signature, message) {
    const messageHash = ethereumjsUtil.toBuffer(web3.utils.sha3(message));
    const { v, r, s } = ethereumjsUtil.fromRpcSig(signature);
    const pub = ethereumjsUtil.ecrecover(messageHash, v, r, s);
    const addrBuf = ethereumjsUtil.pubToAddress(pub);
    const recoveredAddress = ethereumjsUtil.bufferToHex(addrBuf);
    return recoveredAddress
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
        ws.subscribe('MouseBroadcast');
        ws.subscribe('broadcast');
        ws.id = uuidv4();
        clients.push(ws);
        console.log("§ id: ", ws.id)
    },
    message: (ws, message, isBinary) => {
        console.log("%: id:", ws.id)
        const messageObj = JSON.parse(Buffer.from(message).toString())
        if (messageObj.topic === 'verify') {
            const recoveredAddress = recoverAddress(messageObj.data.signature, "\x19Ethereum Signed Message:\n" + "2" + "mc")
            console.log('recoveredAddress:', recoveredAddress)
            // if (!verifiedClients.find(client => client.address === recoveredAddress)) {
            verifiedClients.push({
                id: ws.id,
                address: recoveredAddress
            })
            pushToAll({ topic: "verifiedClients", verifiedClients: verifiedClients })
            // }
        } else if (messageObj.topic === 'MousePosition') {
            console.log("messageObj", messageObj);
            console.log("ws", ws);
            const newMessage = { topic: "MousePosition", address: verifiedClients.find(client => client.id == ws.id)?.address, ...messageObj.data };
            console.log('newMessage', newMessage);
            ws.publish('MouseBroadcast', JSON.stringify(newMessage), isBinary);

        } else {
            ws.publish('broadcast', message, isBinary);
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