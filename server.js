if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const http = require("http");
const express = require("express");
const fs = require("fs");
const child = require("child_process");
const ipc = require("node-ipc");
const app = express();
const passport = require("passport");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const WebSocket = require("ws");
// CONFIG SETUP
const dataManager = require("./modules/dataManager");
const authTicket = require("./modules/tickets");

var config = dataManager.loadConfig();
console.log(config);
var botFile = config.botFile;
const SOCKET_PATH = config.ipc.socketPath;

// ENV VARS
const users = process.env.USERS.split("|");
const botLogins = process.env.BOT_LOGINS.split("|");
const botPasswords = process.env.BOT_PASSWORDS.split("|");
const sessionSecret = process.env.SESSION_SECRET;
const PORT = config.port;
const HOST = config.host;
const wss = new WebSocket.Server({ noServer: true });

const initializePassport = require("./modules/passport-config");

initializePassport(passport, users);
initializeIPC();

var sockets = new Map();
var botProcesses = new Map();
var MC_ADDRESS = process.env.MC_ADDRESS;
var MC_PORT = process.env.MC_PORT;

// EXPRESS STUFF
app.set("trust proxy", 1); // trust first proxy
app.set("view engine", "ejs");
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// EXPRESS ROUTES

app.get("/", checkAuthenticated, function (request, response) {
  file = "index.html";
  fileType = "text/html";
  sendResponse(response, file, fileType);
});

app.get("/login", checkNotAuthenticated, function (request, response) {
  file = "login.html";
  fileType = "text/html";
  sendResponse(response, file, fileType);
});

app.get("/auth/github", passport.authenticate("github"), function (req, res) {
  // The request will be redirected to GitHub for authentication, so this
  // function will not be called.
});

app.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  function (req, res) {
    res.redirect("/");
  }
);

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

app.get(/.*.(js)/, checkAuthenticated, function (request, response) {
  file = request.url.substring(1); // here we remove the firs character in the request string which is a "/". this is done because fs gets mad if you dont
  fileType = "application/javascript"; // this sets the fileType to javascript
  sendResponse(response, file, fileType);
});
app.get(/.*.(css)/, function (request, response) {
  file = request.url.substring(1); // look at comment above
  fileType = "text/css"; // sets fileType to css for headers
  sendResponse(response, file, fileType);
});

app.get("/ws", checkAuthenticated, function (request, response) {
  console.time("/ws");
  console.time("Full_Auth");
  console.time("genTicket");
  let ticket = authTicket.generateTicket(request);
  console.timeEnd("genTicket");
  response.status(200);
  response.set({
    "Access-Control-Allow-Headers": "*", // for getting around cors rules
    "Access-Control-Allow-Origin": "*",
  });
  response.send(ticket);
  response.end();
  console.timeEnd("/ws");
});
function sendResponse(response, file, fileType) {
  if (file != "") {
    fs.readFile(file, (err, data) => {
      // error handler
      if (err) {
        var message = "[ERROR]: " + err;
        console.log(message); // logs error message to console
        return404(response); // sends a 404 resource not found to the client
      } else {
        // writes a success header
        response.status(200);
        response.set({
          "Content-Type": fileType, // adds content type
          "Access-Control-Allow-Headers": "*", // for getting around cors rules
          "Access-Control-Allow-Origin": "*",
        });
        response.send(data); // ends the response and sends the data from the file
        response.end();
      }
    });
  } else {
    return404();
  }
}

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.redirect("/login");
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  next();
}

function return404(response) {
  response.status(404);
  response.set({
    "Content-Type": "text/html",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Origin": "*",
  });
  response.send("resource not found");
  response.end();
}

// initialize http server
console.log("starting server");
const server = http.createServer(app);

// set http server listen ports

server.listen(PORT, HOST, () => {
  console.log("[INFO]: https server listening at: " + HOST + ":" + PORT);
});
server.on("close", function () {
  console.log("Connection Closed");
});
// start new bot with bot id

// this authenticates the websocket
server.on("upgrade", handleUpgrade);

wss.on("connection", function connection(ws, req) {
  console.log("[INFO]: New Connection From: " + req.socket.remoteAddress);

  ws.on("message", function incoming(message) {
    var data = JSON.parse(message);
    if (!data.ticket) {
      var action = data.action;
      var botId = data.botId;
      switch (action) {
        case "setServer":
          MC_ADDRESS = data.data.address;
          MC_PORT = data.data.port;
          console.log(MC_ADDRESS + ":" + MC_ADDRESS);
          break;
        case "start":
          if (botId != 0) start(botId, MC_ADDRESS, MC_PORT);
          break;
        case "kill":
          botProcesses.get(botId).kill("SIGHUP");
          break;
        default:
          sendToChild(botId, "data", data);
      }
    }
  });

  ws.on("close", function incoming(code, reason) {
    console.log(
      "[INFO]: Connection Closed By: " +
        req.socket.remoteAddress +
        " Code: " +
        code +
        " " +
        reason
    );
  });
});

function start(botId) {
  console.log("[INFO]: New Bot created and started");
  var username = botLogins[botId];
  var password = botPasswords[botId];
  var botProcess = child.execFile(
    "node",
    [botFile, botId, MC_ADDRESS, MC_PORT, username, password],
    (error, stdout, stderr) => {
      if (error) {
        throw error;
      }
      console.log(stdout);
    }
  );
  botProcesses.set(botId, botProcess);

  botProcess.on("exit", (code, signal) => {
    console.log("child process exited code: " + code);
  });
}

function handleUpgrade(request, socket, head) {
  let ticket = request.url.slice(request.url.indexOf("=") + 1);
  console.time("verification");
  let verified = authTicket.verifyTicket(ticket, request);
  console.timeEnd("verification");
  if (verified) {
    wss.handleUpgrade(request, socket, head, function done(ws) {
      console.timeEnd("Full_Auth");
      wss.emit("connection", ws, request);
    });
  } else {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
}
var sockets = new Map();

function initializeIPC() {
  fs.exists(SOCKET_PATH, (exists) => {
    if (exists) {
      fs.unlink(SOCKET_PATH, () => {
        return;
      });
    }
  });

  ipc.config.id = "parent";
  ipc.config.retry = 1500;
  ipc.config.silent = true;
  ipc.serve(SOCKET_PATH);
  ipc.server.start();

  ipc.server.on("start", ipcListen);
}
function ipcListen() {
  ipc.server.on("connect", (socket) => {
    console.log(socket);
    console.log("Connected");
  });

  ipc.server.on("started", (data, socket) => {
    console.log("adding socket");
    sockets.set(data.botId, socket);
    console.log(data);
    broadcast(data);
  });
  ipc.server.on("data", (data, socket) => {
    broadcast(data);
  });
  ipc.server.on("socket.disconnected", function (socket, destroyedSocketID) {
    socket.destroy();
    console.log("socket disconnected");
    ipc.log("client " + destroyedSocketID + " has disconnected!");
  });
}
function sendToChild(botId, event, data) {
  if (sockets.has(botId)) {
    sockets.get(botId);
    ipc.server.emit(socket, event, data);
  }
}

function broadcast(message) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

module.exports = {
  broadcast,
};
