import { Blink1TransportError } from './transport.js';

function command(preview) {
  const sequence = preview?.sequence;
  const step = sequence?.steps?.[0], target = step?.targets?.[0];
  if (sequence?.timing !== 'serial' || sequence.repeat !== 1 || sequence.on_finish !== 'hold' ||
      sequence.initial !== undefined || !Array.isArray(sequence.steps) || sequence.steps.length !== 1 ||
      !Array.isArray(step?.targets) || step.targets.length !== 1 || step.interval_ms !== undefined ||
      (step.hold_ms !== undefined && step.hold_ms !== 0) || !Number.isInteger(step.fade_ms) ||
      step.fade_ms < 0 || step.fade_ms > 600000 || step.fade_ms % 10 ||
      !Number.isInteger(target?.led) || target.led < 0 || target.led > 2 ||
      typeof target?.color !== 'string' || !/^#[0-9a-f]{6}$/.test(target.color)) {
    throw new Blink1TransportError('preview_only', 'This preview can send one serial Set, Off or Fade target with no hold and on_finish: hold. Multi-step Sequences are preview-only.');
  }
  return { r: parseInt(target.color.slice(1, 3), 16), g: parseInt(target.color.slice(3, 5), 16), b: parseInt(target.color.slice(5, 7), 16), led: target.led, fadeMs: step.fade_ms, color: target.color };
}

export function canSendPreview(preview) { try { command(preview); return true; } catch { return false; } }

// The compiler owns semantic validation. This bounded adapter only sends a
// single target; resolved browser I/O is not optical or Job completion proof.
export async function sendPreview(preview, transport) {
  const target = command(preview); // Validate every field before any USB write.
  await transport.stopNativePlayback();
  await transport.fadeTo(target);
  return { status: 'command_sent', led: target.led, color: target.color, fade_ms: target.fadeMs, optical_completion_measured: false };
}
