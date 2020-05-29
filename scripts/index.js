init()

async function init() {
  // Opus bitrate files to test
  const bitrates = [2, 6, 10, 16, 32, 64, 96, 128, 192, 512]

  // start paused
  const audioCtx = new AudioContext({ latencyHint: 'playback' })
  audioCtx.suspend()

  const [{ files, buffers }, workletNode] = await Promise.all([
    fetchAndDecode(bitrates, audioCtx),
    initAudioWorklet(audioCtx)
  ]).catch(showError)

  // transfer all decoded audio to Worklet
  workletNode.port.postMessage({ init: files }, buffers)

  initDOM(files, audioCtx, workletNode)
}

function showError(e) {
  document.querySelector('#status').innerText = 'Error: ' + e.message
}

function initDOM(files, audioCtx, workletNode) {
  const btnPause = document.querySelector('#pause')
  btnPause.onclick = pause

  const wrapper = document.querySelector('.bitrates')
  const buttons = files.map((file, i) => {
    const btn = document.createElement('button')
    btn.addEventListener('mousedown', () => playBitrate(btn, file, i))
    btn.innerHTML = `<div class="bitrate">${file.bitrate}</div>kbit/s<div class="file-size">${fileSize(file.fileSize)}</div>`
    return btn
  })

  wrapper.innerHTML = ''
  wrapper.append(...buttons)

  function fileSize(size) {
    const kb = size/1024
    return `${kb.toLocaleString(navigator.language, { maximumFractionDigits: 1 })} KiB`
  }

  function pause() {
    audioCtx.suspend()
    btnPause.hidden = true
    resetButtons()
  }

  function resetButtons() {
    buttons.forEach(btn => btn.classList.remove('active'))
  }

  function playBitrate(button, file, index) {
    console.log('playBitrate', file.bitrate)
    const srcParam = workletNode.parameters.get('audioSrcIndex')
    srcParam.setValueAtTime(index, audioCtx.currentTime)
    audioCtx.resume()

    resetButtons()
    button.classList.add('active')

    btnPause.hidden = false
  }
}


// Fetches Opus files and decodes them.
// resolves with { files, buffers }
async function fetchAndDecode(bitrates, audio) {
  // all decoded sample buffers for Transferrable postMessage
  const buffers = []

  // [{ bitrate, fileSize, pcmLeft, pcmRight }]
  const files = await Promise.all(bitrates.map(async bitrate => {
    const response = await fetch(`audio/music-${bitrate}.opus`)
    const fileSize = response.headers.get('content-length')
    const audioBuffer = await audio.decodeAudioData(await response.arrayBuffer())
    const pcmLeft =  audioBuffer.getChannelData(0)
    const pcmRight = audioBuffer.getChannelData(1)
    buffers.push(pcmLeft.buffer, pcmRight.buffer)
    return { bitrate, fileSize, pcmLeft, pcmRight }
  }))

  return { files, buffers }
}

async function initAudioWorklet(audioCtx) {
  await audioCtx.audioWorklet.addModule('scripts/worklet-bitrate-switcher.js')
  const workletNode = new AudioWorkletNode(audioCtx, 'bitrate-switcher', {
    outputChannelCount: [2]  // stereo
  })
  workletNode.connect(audioCtx.destination)
  return workletNode
}
