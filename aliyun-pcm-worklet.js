class AliyunPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const frameSize = Number(options?.processorOptions?.frameSize || 4096);
    this.frameSize = Number.isFinite(frameSize) && frameSize > 0 ? frameSize : 4096;
    this.buffer = new Float32Array(this.frameSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs?.[0]?.[0];
    if (!channel || !channel.length) return true;

    let srcOffset = 0;
    while (srcOffset < channel.length) {
      const remaining = this.frameSize - this.offset;
      const copyCount = Math.min(remaining, channel.length - srcOffset);
      this.buffer.set(channel.subarray(srcOffset, srcOffset + copyCount), this.offset);
      this.offset += copyCount;
      srcOffset += copyCount;

      if (this.offset >= this.frameSize) {
        const chunk = new Float32Array(this.buffer);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor('aliyun-pcm-capture', AliyunPcmCaptureProcessor);
