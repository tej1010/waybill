import { getAccountsCollection, getPhonesCollection, isMongoConnected } from "./mongodb.js";

export async function getRegistryStats() {
  if (!isMongoConnected()) {
    return {
      connected: false,
      accounts: 0,
      phones: 0,
      samplePhones: [],
    };
  }

  const accounts = getAccountsCollection();
  const phones = getPhonesCollection();

  const [accountCount, phoneCount, samplePhones] = await Promise.all([
    accounts.countDocuments(),
    phones.countDocuments(),
    phones
      .find(
        {},
        {
          projection: {
            phone: 1,
            username: 1,
            gstin: 1,
            accountId: 1,
            linkedAt: 1,
            lastLoginAt: 1,
          },
        }
      )
      .sort({ lastLoginAt: -1 })
      .limit(10)
      .toArray(),
  ]);

  return {
    connected: true,
    accounts: accountCount,
    phones: phoneCount,
    samplePhones,
  };
}
