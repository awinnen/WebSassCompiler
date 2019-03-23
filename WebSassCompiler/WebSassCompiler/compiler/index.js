'use strict';
const createHandler = require("azure-function-express").createHandler;
const debug = require('debug');
const express = require('express');
const fs = require('fs-extra');
const logger = require('morgan');
const bodyParser = require('body-parser');
const sass = require('node-sass');
const extract = require('extract-zip');
const formidableMiddleware = require('express-formidable');
const cors = require('cors');

const tmpUploadDir = "/tmp/";
fs.ensureDirSync(tmpUploadDir);
fs.emptyDirSync(tmpUploadDir);

const app = express();
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(formidableMiddleware({
	encoding: 'utf-8',
	uploadDir: tmpUploadDir,
	multiples: true // req.files to be arrays of files
}));
app.use(cors())

app.get("/", (req, res) => {
	res.sendFile(`${__dirname}/index.html`);
});

app.post("/", (req, res, next) => {
	if (Object.keys(req.files).length === 0) {
		return next(createError('No files were uploaded.', null, 400));
	} else if (Object.keys(req.files).length > 1) {
		return next(createError('More than one file uploaded. You must upload one .zip file', null, 400));
	} else if (!req.fields.entryFile) {
		return next(createError('No EntryFile specified. You need to specify an entrypoint. Usually something like main.scss', null, 400));
	}

	const extractPath = createTempPath();
	const entryFile = `${extractPath}${req.fields.entryFile}`;
	const zip = Object.values(req.files)[0];

	if (!zip.name.endsWith(".zip")) {
		return next(createError("Not a .zip file.", null, 400));
	}

	extract(`${zip.path}`, { dir: extractPath }, function (err) {
		if (err) {
			next(createError("Error extracting archive", err, 500));
		} else if (!fs.existsSync(entryFile)) {		
			return next(createError("EntryFile does not exist in zip archive", {
				uploadedFile: zip.name,
				entryFile: entryFile,
				filesList: fs.readdirSync(extractPath)
			}, 400));
		}
		sass.render({ file: entryFile, outputStyle: req.fields.outputStyle || "expanded" }, (err, result) => {
			if (err) {
				next(createError("Cannot compile SASS", err, 500));
			}
			fs.removeSync(extractPath);
			return res.contentType("text/css").send(result.css);
		});
	});

});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	const err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use((err, req, res, next) => {
		res.status(err.status || 500).json({
			message: err.message,
			error: err,
			node_version: process.version
		});
	});
}

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, next) => {
	return res.status(err.status || 500).json({
		message: err.message,
		error: {},
		node_version: process.version
	});
});

app.set('port', process.env.PORT || 3000);
process.on('uncaughtException', (ex) => {
});
const server = app.listen(app.get('port'), () => {
	debug('Express server listening on port ' + server.address().port);
});

// Binds the express app to an Azure Function handler
module.exports = createHandler(app);

function createError(message, object, status) {
	const err = new Error(message);
	Object.assign(err, object || {});
	err.status = status || 500;
	return err;
}

function createTempPath() {
	const path = `${tmpUploadDir}scss/${Date.now()}/`;
	fs.ensureDirSync(path);
	return path;
}