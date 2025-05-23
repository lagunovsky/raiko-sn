import readline from 'readline'

let rpcEndpoint
let raikoEndpoint = `${process.env['RAIKO_SN_RAIKO_PROTOCOL'] ?? 'http'}://${process.env['RAIKO_SN_RAIKO_HOST'] ?? 'localhost'}:${process.env['RAIKO_SN_RAIKO_PORT']}`

let l1ByNetwork = {
  'ethereum': 'ethereum',
  'holesky': 'holesky',
  'taiko_mainnet': 'ethereum',
  'taiko_a7': 'holesky',
  'taiko_dev': 'taiko_dev_l1',
}

let proofParams = {
  'native': {
    proof_type: 'NATIVE',
    blob_proof_type: 'proof_of_equivalence',
    native: {json_guest_input: null},
  },
  'sp1': {
    proof_type: 'sp1',
    blob_proof_type: 'proof_of_equivalence',
    sp1: {recursion: 'plonk', prover: 'network', verify: true},
  },
  'sp1-aggregation': {
    proof_type: 'sp1',
    blob_proof_type: 'proof_of_equivalence',
    sp1: {recursion: 'compressed', prover: 'network', verify: false},
  },
  'sgx': {
    proof_type: 'sgx',
    sgx: {
      instance_id: 123,
      setup: false,
      bootstrap: false,
      prove: true,
      input_path: null,
    },
  },
  'sgxgeth': {
    proof_type: 'sgxgeth',
    sgxgeth: {
      instance_id: 456,
      setup: false,
      bootstrap: false,
      prove: true,
      input_path: null,
    },
  },
  'risc0': {
    proof_type: 'risc0',
    blob_proof_type: 'proof_of_equivalence',
    risc0: {bonsai: false, snark: false, profile: true, execution_po2: 18},
  },
  'risc0-bonsai': {
    proof_type: 'risc0',
    blob_proof_type: 'proof_of_equivalence',
    risc0: {bonsai: true, snark: true, profile: false, execution_po2: 20},
  },
}

async function rpc(method, params) {
  let response = await fetch(rpcEndpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      method,
      params,
      id: Date.now(),
      jsonrpc: '2.0'
    })
  })
  let data = await response.json()
  if (data.error) throw new Error(`Error: ${data.error.message}`)
  return data.result
}

async function getLastBlock() {
  return rpc('eth_blockNumber', [])
}

async function l1OriginByID(blockNumber) {
  return rpc('taiko_l1OriginByID', [blockNumber])
}

async function ask(question, defaultValue) {
  let rl = readline.createInterface({input: process.stdin, output: process.stdout})
  rl.setPrompt(question)
  rl.prompt()
  if (defaultValue !== undefined) rl.write(defaultValue)
  let answer = await new Promise(resolve => rl.once('line', resolve))
  rl.close()
  return answer
}

async function main() {
  let network = process.env['RAIKO_SN_NETWORK']
  if (!network) {
    network = await ask(`Enter network [${Object.keys(l1ByNetwork).join(', ')}]: `, 'taiko_a7')
  }

  if (network === 'taiko_a7') rpcEndpoint = process.env['RAIKO_SN_TAIKO_A7_RPC']
  if (network === 'taiko_mainnet') rpcEndpoint = process.env['RAIKO_SN_TAIKO_MAINNET_RPC']
  if (!network) {
    rpcEndpoint = await ask(`Enter RPC endpoint for ${network}: `, 'http://localhost:8545')
  }

  let lastBlockRaw = await getLastBlock()
  let lastBlock = BigInt(lastBlockRaw)

  let blocksRaw = await ask('Enter blocks (comma separated): ', lastBlock.toString())
  let blocks = blocksRaw.split(',').map(block => BigInt(block.trim())).sort()
  if (blocks.length === 0) {
    console.error('No blocks provided')
    process.exit(1)
  }

  let proofType = await ask(`Enter proof type [${Object.keys(proofParams).join(', ')}]: `, 'sgxgeth')
  if (!proofParams[proofType]) {
    console.error(`Invalid proof type: ${proofType}`)
    process.exit(1)
  }

  let batches = []
  for (let block of blocks) {
    let origin = await l1OriginByID('0x' + block.toString(16))
    batches.push({batch_id: Number(block), l1_inclusion_block_number: Number(origin.l1BlockHeight)})
  }

  for (let i = 0; i < 42; i++) {
    let response = await fetch(`${raikoEndpoint}/v3/proof/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network: network,
        l1_network: l1ByNetwork[network],
        batches,
        prover: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        aggregate: false,
        ...proofParams[proofType],
      }),
    })
    let {data} = await response.json()
    if (data) {
      if (data.status) {
        console.log(new Date().toISOString(), data.status)
      }
      if (data.proof) {
        console.log(new Date().toISOString(), data.proof)
        break
      }
    }
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}

main()
