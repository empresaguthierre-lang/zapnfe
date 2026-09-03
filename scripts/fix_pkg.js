const fs = require("fs");
let content = fs.readFileSync("package.json", "utf8");
content = content.replace(/^\uFEFF/, "");
fs.writeFileSync("package.json", content, "utf8");
