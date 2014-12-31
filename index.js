#!/usr/bin/env node

'use strict'

var Docker = require('dockerode'),
    dockerHost = require('docker-host')(),
    http = require('http'),
    q = require('q'),
    format = require('format'),
    moment = require('moment'),
    colors = require('colors'),
    es = require('event-stream'),
    DockerEvents = require('docker-events'),
    _ = require('underscore');

http.globalAgent.maxSockets = 1000;
dockerHost.protocol = dockerHost.protocol.slice(0, -1);
var docker = new Docker(dockerHost);
var edocker = new Docker(dockerHost);
var emitter = new DockerEvents({
    docker: edocker,
});


var colorForImage = [colors.red, colors.grey, colors.yellow, colors.green, colors.blue];
var dockerColor = colors.gray;

function containerName(containerInfo) {
    return _(containerInfo.Names).filter(function(name) {
        return name.split('/').length == 2
    })[0].split('/')[1];
}

function constructLogLine(containerName, color, timestamp, data) {
    return colors.bold(color(containerName + '(' + timestamp.format('YYYY.MM.DD hh:mm:ss') + ')' + ':')) + color(data + '\n');
}
var colorSelector = 0;

function selectNextColor() {
    colorSelector += 1;
    colorSelector = colorSelector % colorForImage.length;
    return colorForImage[colorSelector];
}

function rewireContainerStd(containerId, name) {
    var container = new Docker(dockerHost).getContainer(containerId);
    container.logs({
        follow: true,
        timestamps: true,
        stdout: true,
        stderr: true,
        tail: 'all'
    }, function(err, stream) {
        var color = selectNextColor();

        stream
            .pipe(es.map(function skipDockerLogsHeaderInfo(data, cb) {
                if (data.length < 8) {
                    cb(null, data);
                    return;
                }
                var firstChar = data[0],
                    secondChar = data[1],
                    thirdChar = data[2],
                    forthChar = data[3];
                if ((firstChar >= 0 && firstChar <= 2) && (secondChar === 0 && thirdChar === 0 && forthChar === 0)) {
                    cb(null, data.slice(8));
                } else
                    cb(null, data);
            }))
            .pipe(es.split())
            .pipe(es.map(function(data, cb) {
                if (data.length > 0) {
                    if (data.charAt(0) === '[') {
                        var timestamp = moment(data.substr(1, 30));
                        var line = data.substr(32);
                        cb(null, constructLogLine(name, color, timestamp, line));
                    } else {
                        var timestamp = moment(data.substr(0, 30));
                        var line = data.substr(30);
                        cb(null, constructLogLine(name, color, timestamp, line));
                    }
                }
            }))
            .pipe(process.stdout);
    });
}


q.ninvoke(docker, 'listContainers')
    .then(function(containersInfo) {
        return q.all(_(containersInfo)
            .map(function(containerInfo) {
                var name = containerName(containerInfo);
                rewireContainerStd(containerInfo.Id, name);
            })
        );
    })
    .then(function() {
        console.log("All pipes rewired ;)");
    })
    .done();

emitter.start();

function dockerLog(logLine) {
    return constructLogLine('Docker', dockerColor, moment(), logLine);
}
emitter.on("connect", function() {
    console.log("connected to docker api");
});

emitter.on("disconnect", function() {
    console.log("disconnected to docker api; reconnecting");
});

emitter.on("_message", function(message) {
    // console.log("got a message from docker: %j", message);
});

emitter.on("create", function(message) {
    // console.log("container created: %j", message);
});

emitter.on("start", function(message) {
    var container = docker.getContainer(message.id);
    q.ninvoke(container, 'inspect').then(function(info) {
        var name = info.Name.substr(1);
        rewireContainerStd(message.id, name);
    });
});

emitter.on("stop", function(message) {
    console.log(dockerLog(format('Container stopped, id: %s based on %s', message.id, message.from)));
});

emitter.on("die", function(message) {
    console.log(dockerLog(format('Container died, id: %s based on %s', message.id, message.from)));
});

emitter.on("destroy", function(message) {
    console.log(dockerLog(format('Container destroyed, id: %s based on %s', message.id, message.from)));
});
