import path from 'node:path';
import { execa } from 'execa';


export default class UnArchiver {
  private readonly binaryPath: string | undefined;

  constructor(binaryPath?: string) {
    this.binaryPath = binaryPath;
  }

  unar(archive: string, onProgress?: (progress: string) => void) {
    const cmd = [this.unarExecutable(), archive];
    return this.runAwait(cmd, onProgress);
  }

  async lsar(archive: string, lsarOptions?: LsarOptions): Promise<LsarResult> {
    const cmd = [this.lsarExecutable(), archive];
    const result = await execa(this.lsarExecutable(), [
      archive,
      ...this.lsarFlags(lsarOptions),
    ], {
      lines: true,
    });
    if (result.exitCode === 0) {
      return lsarConvertOutput(result.stdout.join(''));
    } else {
      throw new Error(result.stderr.join('\n'));
    }
  }

  executableExt() {
    switch (process.platform) {
      case 'win32':
        return '.exe';
      default:
        return '';
    }
  }

  unarExecutable() {
    if (this.binaryPath) {
      return path.resolve(this.binaryPath, `unar${this.executableExt()}`);
    } else {
      return `unar${this.executableExt()}`;
    }
  }

  lsarExecutable() {
    if (this.binaryPath) {
      return path.resolve(this.binaryPath, `lsar${this.executableExt()}`);
    } else {
      return `lsar${this.executableExt()}`;
    }
  }

  private unarFlags(options?: UnarOptions) {
    options = options || ({} as UnarOptions);
    const flags = [];

    if (options.outputDir) {
      flags.push('-output-directory', `'${options.outputDir}'`);
    }

    if (options.forceOverwrite) {
      flags.push('-force-overwrite');
    }

    if (options.forceRename) {
      flags.push('-force-rename');
    }

    if (options.forceSkip) {
      flags.push('-force-skip');
    }

    if (options.forceDirectory) {
      flags.push('-force-directory');
    }

    if (options.noDirectory) {
      flags.push('-no-directory');
    }

    if (options.password) {
      flags.push('-password', `'${options.password}'`);
    }

    if (options.encoding) {
      flags.push('-encoding', `${options.encoding}`);
    }

    if (options.passwordEncoding) {
      flags.push('-password-encoding', `${options.passwordEncoding}`);
    }

    if (options.indexes) {
      flags.push(options.indexes.map((i) => `-indexes ${i}`));
    }

    if (options.noRecursion) {
      flags.push('-no-recursion');
    }

    if (options.copyTime) {
      flags.push('-copy-time');
    }

    if (options.quiet) {
      flags.push('-quiet');
    }

    return flags;
  }

  lsarFlags(options?: LsarOptions) {
    options = options || ({} as LsarOptions);
    const flags = [];

    if (options.noRecursion) {
      flags.push('-no-recursion');
    }

    if (options.password) {
      flags.push('-password', `'${options.password}'`);
    }

    if (options.passwordEncoding) {
      flags.push('-password-encoding', `${options.passwordEncoding}`);
    }

    if (options.encoding) {
      flags.push('-encoding', `${options.encoding}`);
    }

    if (options.printEncoding) {
      flags.push('-print-encoding', `${options.printEncoding}`);
    }

    flags.push('-json');

    return flags;
  }

  private run(cmd: string[]) {
    const proc = execa(cmd[0], cmd.slice(1), {
      all: true,
      lines: true,
    });
    return {
      proc,
      iter: proc.iterable({ from: 'all' }),
    };
  }

  private async runAwait(cmd: string[], onProgress: (progress: string) => void) {
    const { proc, iter } = this.run(cmd);

    for await (const line of iter) {
      onProgress(line);
    }
    return proc;
  }
}

export interface UnarOptions {
  outputDir?: string;
  forceOverwrite: boolean;
  forceRename?: boolean;
  forceSkip?: boolean;
  forceDirectory?: boolean;
  noDirectory: boolean;
  password?: string;
  encoding?: string;
  passwordEncoding?: string;
  indexes?: number[];
  noRecursion?: boolean; // default: false
  copyTime?: boolean; // default: true
  quiet?: boolean;
}

export interface LsarOptions {
  noRecursion?: boolean;
  password?: string;
  passwordEncoding?: string;
  encoding?: string;
  printEncoding?: string;
}

export const lsarConvertOutput = (output: string): LsarResult => {
  const raw = JSON.parse(output) as _LsarResult<number>;

  return {
    ...raw,
    lsarContents: raw.lsarContents.map((e) => {
      return {
        ...e,
        XADIsEncrypted: e.XADIsEncrypted === 1,
        XADIsDirectory: e.XADIsDirectory === 1,
      };
    }),
    lsarProperties: {
      ...raw.lsarProperties,
      XADIsEncrypted: raw.lsarProperties.XADIsEncrypted === 1,
      XADVolumeScanningFailed: raw.lsarProperties.XADVolumeScanningFailed === 1,
    },
  };
};

export type LsarResult = _LsarResult<boolean>

interface _LsarResult<B> {
  lsarFormatVersion: number;
  lsarContents: LsarEntry<B>[];
  lsarEncoding: string;
  lsarConfidence: number;
  lsarFormatName: string;
  lsarProperties: LsarProperties<B>;
}

interface LsarProperties<B> {
  XADIsEncrypted?: B;
  XADVolumeScanningFailed?: B;
  XADVolumes: string[];
  XADArchiveName: string;
}

interface LsarEntry<B> extends LsarEntryXADProperties<B>, LsarExtraProperties {
}

type LsarExtraProperties = Partial<Lsar7z & LsarRAR5 & LsarZip>;

interface LsarEntryXADProperties<B> {
  XADIsDirectory: B;
  XADIsEncrypted: B;
  XADWindowsFileAttributes?: number;
  XADLastModificationDate: string;
  XADIndex: number;
  XADFileName: string;
  XADCompressionName?: string;
  XADCompressedSize?: number;
  XADFileSize?: number;
}

interface Lsar7z {
  '7zCRC32'?: number;
}

interface LsarRAR5 {
  RAR5InputParts: {
    CRC32?: number;
    InputLength: number;
    Offset: number;
  }[];
  RAR5CompressionMethod: number;
  RAR5DictionarySize: number;
  RAR5CRC32: number;
  RAR5CompressionVersion: number;
  RAR5CompressionInformation: number;
  RAR5OSName: string;
  RAR5Attributes: number;
  RAR5DataLength: number;
  RAR5Flags: number;
  RAR5DataOffset: number;
  RAR5OS: number;
}

interface LsarZip {
  ZipCRC32: number;
  ZipFileAttributes: number;
}
