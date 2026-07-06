const https = require("https")
const dotenv = require("dotenv")
dotenv.config()

const pingSelf = () => {
    fetch(`https://${process.env.WAN_URL}`, {
        method: "GET"
    }).catch(error => console.error("Error while pinguing self:", error))
}

const getCloudflareDnsData = async () => {
    try {
        return await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.ZONE_ID}/dns_records?name=${process.env.RECORD_NAME}&type=A`, {
            method: "GET",
            redirect: "follow",
            headers: {
                "Authorization": `Bearer ${process.env.CLOUDFLARE_TOKEN}`,
                "Accept": "application/json"
            }
        })
    } catch (error) {
        return null;
    }
}

const modifyRecordIp = async (recordData, ip) => {
    try {
        return await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.ZONE_ID}/dns_records/${recordData.id}`, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${process.env.CLOUDFLARE_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ content: ip })
        })
    } catch (error) {
        console.error(error)
        return null;
    }
}

const getWanIp = async () => {
    try {
        return await fetch("https://ifconfig.me/ip", {
            method: "GET"
        })
    } catch (error) {
        return null;
    }
}

const triggerIpUpdate = async () => {
    return new Promise(async (resolve) => {
        const currentWanIp = await getWanIp().then(response => response.text())
        const dnsData = await getCloudflareDnsData().then(response => response.json())

        if (currentWanIp && dnsData && dnsData.result && dnsData.result.length == 1) {
            const recordData = dnsData.result[0];
            if (currentWanIp !== recordData.content) {
                console.log(`Current address for ${process.env.RECORD_NAME} (${currentWanIp}) missmatch with DNS address (${recordData.content}). Requesting patch...`)
                const patchResponse = await modifyRecordIp(recordData, currentWanIp).then(response => response.json())
                console.log(patchResponse)
            }
        }
    })
}

const listen = async () => {
    let timeWithoutPings = 0;
    let lastUpdatedIp = ""

    https.createServer((req, res) => {
        const address = req.socket.remoteAddress;
        if (address === lastUpdatedIp) {
            timeWithoutPings = 0;
        } else {
            res.writeHead(200),
            res.end()
        }
    })
    while (true) {
        do {
            await new Promise(resolve => setTimeout(resolve, 1000));
        } while (timeWithoutPings++ <= process.env.PING_COOLDOWN + 5);

        triggerIpUpdate()
    }
}

setInterval(pingSelf, process.env.PING_COOLDOWN)
listen()