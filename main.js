'use strict';
let pc;
let channel;
let input = document.querySelector('input');
let label = document.querySelector('label');
let imgContainer = document.getElementById('imgContainer');
let receivedFile;
let receiveBuffer = [];
let receivedSize = 0;
let remoteWindow = (window.opener) ? window.opener : window.open('/', '_blank');
window.addEventListener('load', createConnection, false);
window.addEventListener('message', onSignaling, false);
input.addEventListener('change', onInputChange, false);
function createConnection() {
    let configuration = null;
    pc = new RTCPeerConnection(configuration);
    channel = pc.createDataChannel('DataChannel');
    setChannel();
    if (window.opener) {
        pc.createOffer()
            .then(desc => pc.setLocalDescription(desc))
            .then(sendOfferToRemoteWindow)
            .catch(error => console.error('Ошибка при создании предложения:', error));
    }
    ;
    pc.onicecandidate = (e) => {
        if (e.candidate) {
            let message = JSON.stringify({
                type: 'ice',
                candidate: e.candidate
            });
            remoteWindow.postMessage(message, location.origin);
        }
    };
    pc.ondatachannel = (e) => {
        channel = e.channel;
        setChannel();
    };
}
;
function setChannel() {
    channel.binaryType = 'arraybuffer';
    channel.onmessage = onChannelMessage;
    channel.onopen = onChannelStateChange;
    channel.onclose = onChannelStateChange;
    channel.onerror = onChannelError;
}
;
function onSignaling(e) {
    let message = JSON.parse(e.data);
    if (message.type === 'offer') {
        pc.setRemoteDescription(message.sdp);
        pc.createAnswer()
            .then(answer => pc.setLocalDescription(answer))
            .then(sendAnswerToRemoteWindow)
            .catch(error => console.error('Ошибка в ответе:', error));
    }
    if (message.type === 'answer') {
        pc.setRemoteDescription(message.sdp);
    }
    if (message.type === 'ice') {
        pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
}
;
function sendOfferToRemoteWindow() {
    let message = { type: 'offer', sdp: pc.localDescription };
    remoteWindow.postMessage(JSON.stringify(message), window.location.origin);
}
;
function sendAnswerToRemoteWindow() {
    let message = { type: 'answer', sdp: pc.localDescription };
    remoteWindow.postMessage(JSON.stringify(message), window.location.origin);
}
;
function sendMetadata(file) {
    let message = {
        type: 'metadata',
        fileMetadata: { name: file.name, size: file.size }
    };
    channel.send(JSON.stringify(message));
}
;
function onInputChange() {
    let file = input.files[0];
    if (!file) {
        console.log('Файл не выбран');
    }
    else {
        if (file.type.startsWith('image')) {
            insertImage(file);
            sendMetadata(file);
            sendImage(file);
        }
        else {
            console.log('Это не изображение');
        }
        ;
    }
}
;
function insertImage(file) {
    let img = document.createElement('img');
    img.src = window.URL.createObjectURL(file);
    img.onload = () => window.URL.revokeObjectURL(this.src);
    let oldImg = imgContainer.querySelector('img');
    if (oldImg) {
        imgContainer.replaceChild(img, oldImg);
    }
    else {
        imgContainer.appendChild(img);
    }
    ;
}
;
function sendImage(file) {
    if (file.size === 0) {
        console.info('Файл пустой, выбери другой файл');
        return;
    }
    let chunkSize = 16384;
    let sliceFile = function (offset) {
        let reader = new window.FileReader();
        reader.onload = (function () {
            return function (e) {
                channel.send(e.target.result);
                if (file.size > offset + e.target.result.byteLength) {
                    window.setTimeout(sliceFile, 0, offset + chunkSize);
                }
            };
        })(file);
        let slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
    };
    sliceFile(0);
}
;
function onChannelMessage(e) {
    if (typeof e.data === 'object') {
        receiveBuffer.push(e.data);
        receivedSize += e.data.byteLength;
        if (receivedSize === receivedFile.size) {
            let received = new window.Blob(receiveBuffer);
            insertImage(received);
            receivedSize = 0;
            receiveBuffer = [];
        }
    }
    else if (typeof e.data === 'string') {
        let message = JSON.parse(e.data);
        if (message.type) {
            if (message.type === 'metadata')
                receivedFile = message.fileMetadata;
        }
    }
    ;
}
;
function onChannelStateChange() {
    let readyState = channel.readyState;
    if (readyState === 'open') {
        input.removeAttribute('disabled');
        label.removeAttribute('disabled');
    }
    if (readyState === 'closed') {
        input.setAttribute('disabled', 'true');
        label.setAttribute('disabled', 'true');
    }
}
;
function onChannelError(e) {
    console.error('Ошибка канала: ', e);
}
;
//# sourceMappingURL=main.js.map