const { Wallet, ethers } = require('ethers');
const path = require('path');
const axelarLocal = require('@axelar-network/axelar-local-dev');
const { AxelarAssetTransfer, AxelarQueryAPI } = require('@axelar-network/axelarjs-sdk');

/**
 * Get the wallet from the environment variables. If the EVM_PRIVATE_KEY environment variable is set, use that. Otherwise, use the EVM_MNEMONIC environment variable.
 * @returns {Wallet} - The wallet.
 */
function getWallet() {
    checkWallet();
    const privateKey = process.env.EVM_PRIVATE_KEY;
    return privateKey ? new Wallet(privateKey) : Wallet.fromMnemonic(process.env.EVM_MNEMONIC);
}

/**
 * Get testnet chains config from local if it exists, otherwise from axelar-cgp-solidity.
 */
function getTestnetConfig() {
    // check if the testnet config file exists
    try {
        return rootRequire('chain-config/testnet.json');
    } catch (e) {
        return require(`@axelar-network/axelar-cgp-solidity/info/testnet.json`);
    }
}

/**
 * Get the chain objects from the chain-config file.
 * @param {*} env - The environment to get the chain objects for. Available options are 'local' and 'testnet'.
 * @param {*} testnetChains - The list of chains to get the chain objects for if the environment is 'testnet'.
 * Checks the following file for available chain names https://github.com/axelarnetwork/axelar-cgp-solidity/blob/main/info/testnet.json
 * The default list of chains is ['Avalanche', 'Fantom']
 * @returns {Chain[]} - The chain objects.
 */
function getChains(env, testnetChains = ['Avalanche', 'Fantom']) {
    checkEnv(env);

    if (env === 'local') {
        return rootRequire('chain-config/local.json');
    }

    return getTestnetConfig()
        .filter((chain) => {
            return testnetChains.includes(chain.name);
        })
        .map((chain) => ({
            ...chain,
            gasService: chain.AxelarGasService.address,
        }));
}

/**
 * Get the balances of an address on a list of chains.
 * @param {*} chains - The list of chains to get the balances from.
 * @param {*} address - The address to get the balances for.
 * @returns {Object} - The balances of the address on each chain.
 */
async function getBalances(chains, address) {
    const balances = await Promise.all(
        chains.map((chain) => {
            const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
            return provider.getBalance(address).then((b) => b.toString());
        }),
    );

    return balances.reduce((acc, balance, i) => {
        acc[chains[i].name] = balance;
        return acc;
    }, {});
}

/**
 * Get the deposit address for a token on a chain.
 * @param {*} env - The environment to get the deposit address for. Available options are 'local' and 'testnet'.
 * @param {*} source - The source chain object.
 * @param {*} destination - The destination chain object.
 * @param {*} destinationAddress - The destination address.
 * @param {*} symbol - The symbol of the token to get the deposit address for.
 * @returns {string} - The deposit address.
 */
function getDepositAddress(env, source, destination, destinationAddress, symbol) {
    if (env === 'testnet') {
        const listing = {
            aUSDC: env === 'local' ? 'uusdc' : 'uausdc',
        };
        const sdk = new AxelarAssetTransfer({
            environment: 'testnet',
            auth: 'local',
        });
        return sdk.getDepositAddress(source, destination, destinationAddress, listing[symbol]);
    }

    return axelarLocal.getDepositAddress(source, destination, destinationAddress, symbol, 8500);
}

/**
 * Calculate the gas amount for a transaction using axelarjs-sdk.
 * @param {*} source - The source chain object.
 * @param {*} destination - The destination chain object.
 * @param {*} symbol - The symbol of the token to get the deposit address for.
 * @param {*} options - The options to pass to the estimateGasFee function. Available options are gasLimit and gasMultiplier.
 * @returns {number} - The gas amount.
 */
async function calculateBridgeFee(source, destination, options = {}) {
    const api = new AxelarQueryAPI({ environment: 'testnet' });
    const { gasLimit, gasMultiplier, symbol } = options;
    return api.estimateGasFee(source.name, destination.name, symbol || source.tokenSymbol, gasLimit, gasMultiplier || 1.5);
}

/**
 * Check if the wallet is set. If not, throw an error.
 */
function checkWallet() {
    if (process.env.EVM_PRIVATE_KEY == null && process.env.EVM_MNEMONIC == null) {
        throw new Error('Need to set EVM_PRIVATE_KEY or EVM_MNEMONIC environment variable.');
    }
}

/**
 * Check if the environment is set. If not, throw an error.
 * @param {*} env - The environment to check. Available options are 'local' and 'testnet'.
 */
function checkEnv(env) {
    if (env == null || (env !== 'testnet' && env !== 'local')) {
        throw new Error('Need to specify testnet or local as an argument to this script.');
    }
}

/**
 * Get the path to an example.
 * @param {*} exampleName - The name of the example to get the path for.
 * @returns {string} - The path to the example.
 */
function getExamplePath(exampleName) {
    const destDir = path.resolve(__dirname, '..', `examples/${exampleName}/index.js`);
    return path.relative(__dirname, destDir);
}

/**
 * Sanitize the event arguments.
 * This is needed because ethers.js returns the event arguments as an object with the keys being the argument names and the values being the argument values.
 * @param {*} event - The event to sanitize.
 * @returns {Object} - The sanitized event arguments.
 */
function sanitizeEventArgs(event) {
    return Object.keys(event.args).reduce((acc, key) => {
        if (isNaN(parseInt(key))) {
            acc[key] = event.args[key];
        }

        return acc;
    }, {});
}

module.exports = {
    getWallet,
    getDepositAddress,
    getBalances,
    getChains,
    checkEnv,
    calculateBridgeFee,
    getExamplePath,
    sanitizeEventArgs,
};