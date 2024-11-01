import fs from 'node:fs'
import qs from 'node:querystring'

const FMSPCs = [
  '00606A000000',
  '00A067110000',
  '00906ED50000',
]

if (process.env.RAIKO_SN_NETWORK === 'taiko_a7') {
  FMSPCs.push(
    '30606A000000',
    '00706A100000'
  )
}

const [encrypted_ppid, pceid, cpusvn, pcesvn] = fs.readFileSync('/tmp/pckid.csv', 'utf8').trim().split(',')

const url = 'https://api.trustedservices.intel.com/sgx/certification/v4/pckcert'
const query = qs.encode({encrypted_ppid, cpusvn, pcesvn, pceid})

const response = await fetch(`${url}?${query}`, {
  method: 'GET',
  headers: {'Ocp-Apim-Subscription-Key': process.env.INTEL_API_KEY},
})

const FMSPC = response.headers.get('sgx-fmspc')
if (FMSPCs.includes(FMSPC)) {
  console.log(`✅ FMSPC (${FMSPC}) is supported`)
} else {
  console.log(`🚫 FMSPC (${FMSPC}) currently not supported`)
  process.exit(1)
}
