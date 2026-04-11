"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
const fs = require("fs");
const yaml = require("yaml");

function hashFile(file, algorithm = "sha512", encoding = "base64", options) {
    return new Promise((resolve, reject) => {
        const hash = (0, crypto.createHash)(algorithm);
        hash.on("error", reject).setEncoding(encoding);
        (0, fs.createReadStream)(file, { ...options, highWaterMark: 1024 * 1024 /* better to use more memory but hash faster */ })
            .on("error", reject)
            .on("end", () => {
            hash.end();
            resolve(hash.read());
        })
            .pipe(hash, { end: false });
    });
}
const yml_file = process.argv[2]
const yml = fs.readFileSync(yml_file, "UTF8");
const obj = yaml.parse(yml);
console.log(obj.path);
const stats = fs.statSync(obj.path);
const fileSizeInBytes = stats.size;

console.log(obj);
hashFile(obj.path).then(data => { 
	obj.sha512 = data; 
	obj.files[0].sha512 = data; 
	obj.files[0].size = fileSizeInBytes; 
	console.log(obj);
	const to_write = yaml.stringify(obj);
	fs.writeFileSync(yml_file, to_write);
} );
