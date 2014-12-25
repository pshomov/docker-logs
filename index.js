#!/usr/bin/env node

'use strict'

var Docker = require('dockerode'),
    dockerHost = require('docker-host')(),
    fs = require('fs'),
    q = require('q'),
    es = require('event-stream'),
    DockerEvents = require('docker-events'),
    _ = require('underscore');

dockerHost.protocol = dockerHost.protocol.slice(0, -1);
var docker = new Docker(dockerHost);
var emitter = new DockerEvents({
    docker: docker,
});

function containerName(containerInfo) {
    return _(containerInfo.Names).filter(function(name) {
        return name.split('/').length == 2
    })[0].split('/')[1];
}

function constructLogLine(containerInfo, containerName, data) {
    return containerName + ": " + data + '\n';
}

q.ninvoke(docker, 'listContainers')
    .then(function(containersInfo) {
        return q.all(_(containersInfo)
            .map(function(containerInfo) {
                var name = containerName(containerInfo);
                var container = docker.getContainer(containerInfo.Id);
                return q.ninvoke(container, 'logs', {
                        follow: true,
                        timestamps: true,
                        stdout: true,
                        stderr: true
                    })
                    .then(function(stream) {
                        stream
                            .pipe(es.split())
                            .pipe(es.map(function(data, cb) {
                                cb(null, constructLogLine(containerInfo, name, data));
                            }))
                            .pipe(process.stdout);
                        return stream;
                    });
            })
        );
    })
    .then(function() {
        console.log("All pipes rewired ;)");
    })
    .done();

emitter.start();
emitter.on("connect", function() {
    console.log("connected to docker api");
});

emitter.on("disconnect", function() {
    console.log("disconnected to docker api; reconnecting");
});

emitter.on("_message", function(message) {
    console.log("got a message from docker: %j", message);
});

emitter.on("create", function(message) {
    console.log("container created: %j", message);
});

emitter.on("start", function(message) {
    console.log("container started: %j", message);
});

emitter.on("stop", function(message) {
    console.log("container stopped: %j", message);
});

emitter.on("die", function(message) {
    console.log("container died: %j", message);
});

emitter.on("destroy", function(message) {
    console.log("container destroyed: %j", message);
});
