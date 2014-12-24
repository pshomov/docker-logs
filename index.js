'use strict'

var Docker = require('dockerode'),
    fs = require('fs'),
    q = require('q'),
    es = require('event-stream'),
    DockerEvents = require('docker-events'),
    _ = require('underscore');

var docker = new Docker({
    host: '172.16.42.43',
    port: 4243
});
var emitter = new DockerEvents({
  docker: docker,
});

function containerName(containerInfo){
	return _(containerInfo.Names).filter(function(name){return name.split('/').length == 2})[0].split('/')[1];
}

q.ninvoke(docker,'listContainers')
    .then(function(containersInfo) {
        return q.all(_(containersInfo)
            .map(function(containerInfo) {
            	var name = containerName(containerInfo);
            	var container = docker.getContainer(containerInfo.Id);
                return q.ninvoke(container,'logs',{
                        follow: true,
                        timestamps: true,
                        stdout: true,
                        stderr: true
                    })
                    .then(function(stream) {
                        // console.log('rewiring std for', containerInfo.Image)
                        stream
                            .pipe(es.split())
                            .pipe(es.map(function(data, cb) {
                                cb(null, name + ": " + data + '\n');
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