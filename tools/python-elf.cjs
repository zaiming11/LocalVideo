// Inspect generated JNI artifacts without executing or modifying them.
function inspectElf(bytes){
  if(bytes.subarray(0,4).toString('hex')!=='7f454c46'||bytes[5]!==1)throw new Error('Expected a little-endian ELF')
  const wide=bytes[4]===2,word=offset=>wide?Number(bytes.readBigUInt64LE(offset)):bytes.readUInt32LE(offset)
  const header=wide?Number(bytes.readBigUInt64LE(32)):bytes.readUInt32LE(28),size=bytes.readUInt16LE(wide?54:42),count=bytes.readUInt16LE(wide?56:44)
  const loads=[];let dynamic
  for(let i=0;i<count;i++){
    const start=header+i*size,type=bytes.readUInt32LE(start),offset=word(start+(wide?8:4)),address=word(start+(wide?16:8)),length=word(start+(wide?32:16)),alignment=word(start+(wide?48:28))
    if(type===1)loads.push({offset,address,length,alignment})
    if(type===2)dynamic={offset,length}
  }
  if(!dynamic)throw new Error('ELF has no dynamic section')
  let strings;const offsets=[]
  for(let start=dynamic.offset;start<dynamic.offset+dynamic.length;start+=wide?16:8){const type=word(start),value=word(start+(wide?8:4));if(type===5)strings=value;if(type===1)offsets.push(value)}
  const segment=loads.find(load=>strings>=load.address&&strings<load.address+load.length)
  if(!segment)throw new Error('ELF has no dynamic string table')
  const base=segment.offset+strings-segment.address
  return {bits:wide?64:32,machine:bytes.readUInt16LE(18),alignments:loads.map(load=>load.alignment),needed:offsets.map(offset=>bytes.subarray(base+offset,bytes.indexOf(0,base+offset)).toString('utf8'))}
}
module.exports={inspectElf}
