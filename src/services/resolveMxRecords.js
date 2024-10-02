import dns from "dns";
import NodeCache from "node-cache";

const dnsCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

function cachedResolveMx(domain) {
  return new Promise((resolve, reject) => {
    const cachedResult = dnsCache.get(domain);
    if (cachedResult) {
      resolve(cachedResult);
    } else {
      dns.resolveMx(domain, (err, addresses) => {
        if (err) {
          reject(err);
        } else {
          dnsCache.set(domain, addresses);
          resolve(addresses);
        }
      });
    }
  });
}

// Replace your current resolveMxRecords function with this
export const resolveMxRecords = async (domain) => {
  try {
    return await cachedResolveMx(domain);
  } catch (error) {
    console.error(error);
    return [];
  }
};
