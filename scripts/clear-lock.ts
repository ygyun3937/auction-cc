import { redis } from '../src/lib/redis'
async function main() {
  await redis.del('lock:collection')
  console.log('Lock cleared')
  await redis.quit()
}
main()
