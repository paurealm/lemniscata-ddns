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
    return new Promise(async (resolve) => {
        const dnsData = await getCloudflareDnsData().then(response => response.json())

        if (currentWanIp && dnsData && dnsData.result && dnsData.result.length == 1) {
            const recordData = dnsData.result[0];
            if (currentWanIp !== recordData.content) {
                console.log(`Current address for ${process.env.RECORD_NAME} (${currentWanIp}) missmatch with DNS address (${recordData.content}). Requesting patch...`)
                const patchResponse = await modifyRecordIp(recordData, currentWanIp).then(response => response.json())
                console.log(patchResponse)
            }
        }

        resolve();
    })
}

const listenToWanChanges = async () => {
    let lastWanAddress = undefined
    let repeatsUntilFullComprobation = 1
    while (true) {
        try {
            await new Promise(resolve => setTimeout(resolve, 1000 * process.env.PING_COOLDOWN))

            const currentWanIp = await getWanIp().then(response => response.text()).catch(error => lastWanAddress)

            if (isValidIp(currentWanIp) ((currentWanIp !== lastWanAddress) || (repeatsUntilFullComprobation-- == 0))) {
                await triggerIpUpdate(currentWanIp)
                lastWanAddress = currentWanIp
                repeatsUntilFullComprobation = 30
            }
        } catch (_) {}
        
    }
}

const isValidIp = ip => {
    return ("" + ip).match(/^(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/gm)
}

listenToWanChanges()