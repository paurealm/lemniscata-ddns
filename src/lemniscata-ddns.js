const dotenv = require("dotenv")
dotenv.config()

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

const triggerIpUpdate = async currentWanIp => {
    console.log("Triggering IP update")
    return new Promise(async (resolve) => {
        const dnsData = await getCloudflareDnsData().then(response => response.json())
        if (currentWanIp && dnsData && dnsData.result && dnsData.result.length == 1) {
            const recordData = dnsData.result[0];

            if (currentWanIp !== recordData.content) {
                console.log(`Current address for ${process.env.RECORD_NAME} (${currentWanIp}) missmatch with DNS address (${recordData.content}). Requesting patch...`)
                const patchResponse = await modifyRecordIp(recordData, currentWanIp).then(response => response.json())
                console.log("Success:", patchResponse.success)
            }
        }

        resolve();
    })
}

const listenToWanChanges = async () => {
    console.log("Listening for WAN changes")
    let lastWanAddress = undefined
    let repeatsUntilFullComprobation = 1
    while (true) {
        try {
            await new Promise(resolve => setTimeout(resolve, 1000 * process.env.PING_COOLDOWN))

            const currentWanIp = await getWanIp().then(response => response.text()).catch(error => lastWanAddress)
            console.log("Current IP:", currentWanIp)

            if (isValidIp(currentWanIp) && ((currentWanIp !== lastWanAddress) || (repeatsUntilFullComprobation-- == 0))) {
                console.log(`Updating IP from cloudflare (current: ${currentWanIp} - last: ${lastWanAddress})`)

                await triggerIpUpdate(currentWanIp)
                lastWanAddress = currentWanIp
                repeatsUntilFullComprobation = 30
            }
        } catch (error) {
            console.error(error)
        }
        
    }
}

const isValidIp = ip => {
    return ("" + ip).match(/^(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/gm)
}

console.log("ZONE_ID:", process.env.ZONE_ID)
console.log("RECORD_NAME:", process.env.RECORD_NAME)
console.log("CLOUDFLARE_TOKEN:", (process.env.CLOUDFLARE_TOKEN).replace(/./g, "*"))
console.log("PING_COOLDOWN:", process.env.PING_COOLDOWN)
listenToWanChanges()