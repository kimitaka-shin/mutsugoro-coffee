const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store"
  });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 100000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(e);
      }
    });

    req.on("error", reject);
  });
}

function linePush(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;

  if (!token || !userId) {
    return Promise.reject(new Error("LINE environment variables are missing"));
  }

  const body = JSON.stringify({
    to: userId,
    messages: [
      {
        type: "text",
        text
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.line.me",
        path: "/v2/bot/message/push",
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      response => {
        let result = "";

        response.on("data", chunk => {
          result += chunk;
        });

        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(result);
          } else {
            reject(
              new Error(`LINE API ${response.statusCode}: ${result}`)
            );
          }
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function makeMessage(data) {
  const map = data.map || {};

  const sweet = Number(map.sweet || 0);
  const acidity = Number(map.acidity || 0);

  const sweetText =
    sweet >= 60 ? "甘さ寄り" :
    sweet <= 40 ? "苦味寄り" :
    "中間";

  const acidityText =
    acidity >= 60 ? "酸味強め" :
    acidity <= 40 ? "酸味控えめ" :
    "中間";

  return [
    "【六二五六珈琲｜新しいお客様】",
    `受付番号：${data.sessionCode || "未発行"}`,
    `気分：${(data.keywords || []).join("・") || "—"}`,
    `味わい地図：${sweetText}・${acidityText}`,
    `選択位置：甘さ ${sweet}% / 酸味 ${acidity}%`,
    "",
    "味わい地図が選択されました。"
  ].join("\n");
}

function serveFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, { error: "forbidden" });
  }

  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  try {
    const file = fs.readFileSync(filePath);
    const ext = path.extname(filePath);

    res.writeHead(200, {
      "Content-Type": `${types[ext] || "application/octet-stream"}; charset=utf-8`,
      "Cache-Control": "no-store"
    });

    res.end(file);
  } catch (error) {
    send(res, 404, { error: "not found" });
  }
}

const server = http.createServer(async (req, res) => {

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true });
  }

  if (
    req.method === "POST" &&
    req.url === "/api/taste-selected"
  ) {
    try {
      const data = await readJson(req);

      if (!data.map) {
        return send(res, 400, {
          ok: false,
          error: "map is required"
        });
      }

      await linePush(makeMessage(data));

      return send(res, 200, { ok: true });

    } catch (error) {
      console.error(error);

      return send(res, 500, {
        ok: false,
        error: "notification failed"
      });
    }
  }

  if (req.method === "GET") {
    return serveFile(req, res);
  }

  return send(res, 404, {
    ok: false,
    error: "not found"
  });
});

server.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
