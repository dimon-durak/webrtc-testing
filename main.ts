'use strict';

interface IFileMetadata {
  size: number;
  name: String;
}

interface IMessage {
  type: String;
  sdp?: RTCSessionDescription;
  candidate?: RTCIceCandidate;
  file?: IFileMetadata;
}

let pc:RTCPeerConnection;
let channel ;

let input: HTMLInputElement = document.querySelector('input');
let label: HTMLLabelElement = document.querySelector('label');
let imgContainer: HTMLElement = document.getElementById('imgContainer');

let receivedFile: IFileMetadata;
let receiveBuffer: Object[] = [];
let receivedSize: number = 0;

let remoteWindow: Window = (window.opener) ? window.opener : window.open('/','_blank');

window.addEventListener('load', createConnection, false);
window.addEventListener('message', onSignaling, false);
input.addEventListener('change', onInputChange, false);

function createConnection(): void {
  let servers: RTCIceServer = null;
  let pcConstraint = null;

  pc = new RTCPeerConnection(servers, pcConstraint);

  channel = pc.createDataChannel('DataChannel');
  setChannel();

  if (window.opener) {
    pc.createOffer()
      .then(desc => pc.setLocalDescription(desc))
      .then(sendOfferToRemoteWindow)
      .catch(error => console.error('Ошибка при создании предложения:', error));
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      let message = JSON.stringify({
        type: 'ice',
        candidate: e.candidate
      });
      remoteWindow.postMessage(message, location.origin)
    }
  };

  pc.ondatachannel = e => {
    channel = e.channel;
    setChannel();
  };
};

function setChannel():void {
  channel.binaryType = 'arraybuffer';
  channel.onmessage = onChannelMessage;
  channel.onopen = onChannelStateChange;
  channel.onclose = onChannelStateChange;
  channel.onerror = onChannelError;  
};

function onSignaling(e: MessageEvent):void { 
  let message: IMessage = JSON.parse(e.data);

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
  if (message.type === 'metadata') {
    receivedFile = message.file;
  }  
};

function sendOfferToRemoteWindow():void {
  let message: String = JSON.stringify({
    type: 'offer',
    sdp: pc.localDescription
  });
  remoteWindow.postMessage(message, window.location.origin)
};

function sendAnswerToRemoteWindow():void {
  let message: String = JSON.stringify({
    type: 'answer',
    sdp: pc.localDescription
  });
  remoteWindow.postMessage(message, window.location.origin)
};

function sendMetadataToRemoteWindow(file: File):void {
  let message: String = JSON.stringify({
    type: 'metadata',
    file: { name: file.name, size: file.size }
  });
  remoteWindow.postMessage(message, window.location.origin)
};

function onInputChange():void {
  let file = input.files[0];
  if (!file) {
    console.log('Файл не выбран');
  } else {
    if (file.type.startsWith('image')) {
      insertImage(file);
      sendMetadataToRemoteWindow(file);
      sendImage(file);
    } else {
      console.log('Это не изображение');
    };
  }
};

function insertImage(file: File|Blob):void {
  let img: HTMLImageElement = document.createElement('img');
  img.src = window.URL.createObjectURL(file);
  img.onload = function() {
    window.URL.revokeObjectURL(this.src)
  };

  let oldImg = imgContainer.querySelector('img');

  if (oldImg) {
    imgContainer.replaceChild(img, oldImg)
  } else {
    imgContainer.appendChild(img)
  }
  
};

function sendImage(file: File):void {
  if (file.size === 0) {
    console.info('Файл пустой, выбери другой файл');
    return;
  }

  let chunkSize = 16384;
  let sliceFile = function(offset: number) {
    let reader = new window.FileReader();
    reader.onload = (function() {
      return function(e) {
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
};

function onChannelMessage(e: MessageEvent):void {
  if (typeof e.data === 'object') {
    receiveBuffer.push(e.data);
    receivedSize += e.data.byteLength;

    if (receivedSize === receivedFile.size) {
      let received = new window.Blob(receiveBuffer);
      insertImage(received);
      receivedSize = 0;
      receiveBuffer = [];
    }
  };
};

function onChannelStateChange():void {
  let readyState = channel.readyState;

  if (readyState === 'open') {
    input.removeAttribute('disabled');
    label.removeAttribute('disabled');
  }  
  if (readyState === 'closed') {
    input.setAttribute('disabled', 'true');
    label.setAttribute('disabled', 'true');
  }
};

function onChannelError(e: MessageEvent):void {
  console.error('Ошибка канала: ', e)
};
