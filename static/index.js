/// WebSocket And stuff
const url = "http://localhost:3000";
var connected = false;
var keys = { w: false, a: false, s: false, d: false, space: false };
var ticket;
var botSelected = 0;
var timeOne = 0;
var timeTwo = 0;

// listeners

document.addEventListener(
  "keydown",
  (event) => {
    var key = "";
    const keyName = event.code;
    switch (keyName) {
      case "KeyW":
        keys.w = true;
        key = "forward";
        break;
      case "KeyA":
        keys.a = true;
        key = "right";
        break;
      case "KeyS":
        keys.s = true;
        key = "back";
        break;
      case "KeyD":
        keys.d = true;
        key = "left";
        break;
      case "Space":
        keys.space = true;
        key = "jump";
        break;
    }
    if (key != "") {
      keylogger(keys);
      send({
        action: "move",
        botId: getCurrentBot(),
        data: { operation: key, state: true },
      });
    }
  },
  false
);

document.addEventListener(
  "keyup",
  (event) => {
    if (event.repeat) {
      return;
    }
    const keyName = event.code;
    switch (keyName) {
      case "KeyW":
        keys.w = false;
        key = "forward";
        break;
      case "KeyA":
        keys.a = false;
        key = "right";
        break;
      case "KeyS":
        keys.s = false;
        key = "back";
        break;
      case "KeyD":
        keys.d = false;
        key = "left";
        break;
      case "Space":
        keys.space = false;
        key = "jump";
        break;
    }
    if (key != "") {
      keylogger(keys);
      send({
        action: "move",
        botId: getCurrentBot(),
        data: { operation: key, state: false },
      });
    }
  },
  false
);

// looks like a function but is actually just to trigger the listeners after the server is online
function listenSocket() {
  socketserver.onopen = function (event) {
    timeTwo = performance.now();
    console.log(`websocket started in ${timeTwo - timeOne} milliseconds.`);
    console.log("connected");
    connected = true;
    serverOnline(true);
  };
  socketserver.onmessage = function (event) {
    console.log(event.data);
    var message = JSON.parse(event.data);
    var botId = message.botId;
    switch (message.action) {
      case "coords":
        setCoords(message.data, botId);
        break;
      case "health":
        setHealth(message.data, botId);
        break;
      case "hunger":
        setHunger(message.data, botId);
        break;
      case "started":
        botOnline(message.action, botId);
        break;
    }
  };
  socketserver.onclose = function (event) {
    console.log("connection closed");
    serverOnline(false);
  };
}

// functions

async function getTicket() {
  return new Promise((resolve, reject) => {
    resolve(
      fetch(url + "/ws", {
        method: "GET",
        headers: {
          "Access-Control-Allow-Headers": "*", // for getting around cors rules
          "Access-Control-Allow-Origin": "*",
          Cookie: document.cookie,
        },
      }).then((data) => data.text())
    );
  });
}

function kill() {
  // this is not used in a button because this will kill the bot.
  // this is only neccissary to use in circumstances in which the connection between the server and the bot process is broken.

  send({
    action: "kill",
    botId: getCurrentBot(),
  });
}

function setServer(address, port) {
  var address = document.getElementById("server").value;
  var port = document.getElementById("port").value;
  var data = { address: address, port: port };

  send({
    action: "setServer",
    botId: getCurrentBot(),
    data: data,
  });
}
function stopBot() {
  send({
    action: "stop",
    botId: getCurrentBot(),
  });
}
function startBot() {
  send({
    action: "start",
    botId: getCurrentBot(),
  });
}

function setHunger(message, botId) {
  if (botId == botSelected) {
    document.getElementById("hunger").innerHTML = message;
  }
}

function setCoords(message, botId) {
  if (botId == botSelected) {
    document.getElementById("coords").innerHTML =
      Math.round(message.x) +
      " " +
      Math.round(message.y) +
      " " +
      Math.round(message.z);
  }
}
function setHealth(message) {
  if (botId == botSelected) {
    document.getElementById("health").innerHTML = message;
  }
}

function getCurrentBot() {
  return document.getElementById("botSelected").value;
}

/*
JSON packet data structure
action: // required
botId: // required
data: // optional

*/
function send(message) {
  JSON.stringify(message);
  socketserver.send(JSON.stringify(message));
}

function closeWebSocket() {
  socketserver.close();
}
async function startWebSocket() {
  timeOne = performance.now();
  let t0 = performance.now();
  console.log("Authenticating");

  getTicket().then((ticket) => {
    socketserver = new WebSocket(
      "ws://0.0.0.0:3000/?ticket=" + ticket,
      "protocolOne"
    );
    listenSocket();
  });
  let t1 = performance.now();
  console.log(`Call to startWebsocket took ${t1 - t0} milliseconds.`);
}

function toggleTheme() {
  document.body.classList.toggle("dark-body");
  for (
    let index = 0;
    index < document.getElementsByClassName("card").length;
    index++
  ) {
    document
      .getElementsByClassName("card")
      .item(index)
      .classList.toggle("bg-dark");
  }
  for (
    let index = 0;
    index < document.getElementsByTagName("svg").length;
    index++
  ) {
    document
      .getElementsByTagName("svg")
      .item(index)
      .classList.toggle("darkSvg");
  }
}

function serverOnline(state) {
  var status = document.getElementById("serverStatus");
  if (state) {
    status.setAttribute("class", "badge badge-success");
    status.innerHTML = "Online";
  } else {
    status.setAttribute("class", "badge badge-danger");
    status.innerHTML = "Offline";
  }
}
function botOnline(state) {
  var status = document.getElementById("botStatus");

  switch (state) {
    case "started":
      status.setAttribute("class", "badge badge-success");
      status.innerHTML = "Connected";
      break;
    case "stopped":
      status.setAttribute("class", "badge badge-danger");
      break;

    case "starting":
      status.setAttribute("class", "badge badge-primary");
      status.innerHTML = "starting";
  }
}

function keylogger(keys) {
  if (keys.w) document.getElementById("w").classList.add("keypressed");
  if (keys.a) document.getElementById("a").classList.add("keypressed");
  if (keys.s) document.getElementById("s").classList.add("keypressed");
  if (keys.d) document.getElementById("d").classList.add("keypressed");
  if (keys.space)
    document.getElementById("spacebar").classList.add("keypressed");
  if (!keys.w) document.getElementById("w").classList.remove("keypressed");
  if (!keys.a) document.getElementById("a").classList.remove("keypressed");
  if (!keys.s) document.getElementById("s").classList.remove("keypressed");
  if (!keys.d) document.getElementById("d").classList.remove("keypressed");
  if (!keys.space)
    document.getElementById("spacebar").classList.remove("keypressed");
}
feather.replace({ id: "icon" });
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  toggleTheme();
}

$("#serverModal").on("show.bs.modal", function (event) {
  var button = $(event.relatedTarget);
  var name = button.data("name");
  var ip = $("#" + name).data("ip");
  var port = $("#" + name).data("port");
  console.log(ip + ":" + port);
  var modal = $(this);
  modal.find(".modal-title").text(name + " Settings");
  modal.find("#server").val(ip);
  modal.find("#port").val(port);
});

setTimeout(() => startWebSocket(), 100);
