/**************************************************************************************************
 * hoobsd                                                                                         *
 * Copyright (C) 2020 HOOBS                                                                       *
 *                                                                                                *
 * This program is free software: you can redistribute it and/or modify                           *
 * it under the terms of the GNU General Public License as published by                           *
 * the Free Software Foundation, either version 3 of the License, or                              *
 * (at your option) any later version.                                                            *
 *                                                                                                *
 * This program is distributed in the hope that it will be useful,                                *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of                                 *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the                                  *
 * GNU General Public License for more details.                                                   *
 *                                                                                                *
 * You should have received a copy of the GNU General Public License                              *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.                          *
 **************************************************************************************************/

import { removeSync } from "fs-extra";
import { execSync, ExecSyncOptions } from "child_process";
import { join } from "path";
import { uname, Utsname } from "node-uname";
import Paths from "../services/paths";
import { Console, NotificationType } from "../services/logger";

export default class FFMPEG {
    static enable(): { success: boolean, error?: string | undefined } {
        const download = "https://github.com/hoobs-org/hoobs-build/raw/master/stage7/00-ffmpeg/files/ffmpeg.tar.gz";

        const packages = [
            "libtool-bin",
            "libtool",
            "openssl",
            "libopus-dev",
            "libx264-dev",
            "libvpx-dev",
            "libvorbis-dev",
            "libtheora-dev",
            "libmp3lame-dev",
            "libfreetype6-dev",
            "libass-dev",
            "libspeex-dev",
            "libfontconfig-dev",
            "frei0r-plugins-dev",
            "libfribidi-dev",
            "librubberband-dev",
            "libsoxr-dev",
            "libvidstab-dev",
            "libwebp-dev",
            "libxml2-dev",
            "libxvidcore-dev",
        ];

        const options: ExecSyncOptions = {
            cwd: join(Paths.storagePath(), ".."),
            stdio: ["inherit", "inherit", "inherit"],
        };

        const utsname: Utsname = uname();

        if ((utsname.sysname || "").toLowerCase() === "linux" && ((utsname.machine || "").toLowerCase() === "armv7l" || (utsname.machine || "").toLowerCase() === "aarch64") && Paths.tryCommand("apt-get")) {
            execSync("apt-get update", options);
            execSync(`apt-get install -y ${packages.join(" ")}`, options);
            execSync(`wget ${download}`, options);
            execSync("tar -xzf ./ffmpeg.tar.gz -C /usr/local --strip-components=1 --no-same-owner", options);
            execSync("rm -f ./ffmpeg.tar.gz", options);
            execSync("ldconfig -n /usr/local/lib", options);
            execSync("ldconfig", options);

            Console.notify(
                "hub",
                "FFMPEG Installed",
                "FFMPEG has been installed and is ready to use.",
                NotificationType.SUCCESS,
                "build",
            );

            return {
                success: true,
            };
        }

        if ((utsname.sysname || "").toLowerCase() !== "linux") {
            Console.notify(
                "hub",
                "FFMPEG Not Installed",
                "This version of FFMPEG is only supported on linux.",
                NotificationType.ERROR,
            );

            return {
                success: false,
                error: "this version of ffmpeg is only supported on linux",
            };
        }

        if (!((utsname.machine || "").toLowerCase() === "armv7l" || (utsname.machine || "").toLowerCase() === "aarch64")) {
            Console.notify(
                "hub",
                "FFMPEG Not Installed",
                "This version of FFMPEG is only supported on ARM processors.",
                NotificationType.ERROR,
            );

            return {
                success: false,
                error: "this version of ffmpeg is only supported on arm processors",
            };
        }

        if (!Paths.tryCommand("apt-get")) {
            Console.notify(
                "hub",
                "FFMPEG Not Installed",
                "This version of FFMPEG requires the APT package manager.",
                NotificationType.ERROR,
            );

            return {
                success: false,
                error: "this version of ffmpeg requires the apt package manager",
            };
        }

        return {
            success: false,
            error: "unhandled error",
        };
    }

    static disable(): { success: boolean, error?: string | undefined } {
        const utsname: Utsname = uname();

        if ((utsname.sysname || "").toLowerCase() === "linux" && ((utsname.machine || "").toLowerCase() === "armv7l" || (utsname.machine || "").toLowerCase() === "aarch64") && Paths.tryCommand("apt-get")) {
            console.log("removing ffmpeg binaries");

            Paths.tryUnlink("/usr/local/bin/ffmpeg");
            Paths.tryUnlink("/usr/local/bin/ffprobe");

            console.log("removing fdk-aac includes");

            Paths.tryUnlink("/usr/local/include/fdk-aac/FDK_audio.h");
            Paths.tryUnlink("/usr/local/include/fdk-aac/aacdecoder_lib.h");
            Paths.tryUnlink("/usr/local/include/fdk-aac/aacenc_lib.h");
            Paths.tryUnlink("/usr/local/include/fdk-aac/genericStds.h");
            Paths.tryUnlink("/usr/local/include/fdk-aac/machine_type.h");
            Paths.tryUnlink("/usr/local/include/fdk-aac/syslib_channelMapDescr.h");

            if (Paths.isEmpty("/usr/local/include/fdk-aac")) removeSync("/usr/local/include/fdk-aac");

            console.log("removing libavcodec includes");

            Paths.tryUnlink("/usr/local/include/libavcodec/ac3_parser.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/adts_parser.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/avcodec.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/avdct.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/avfft.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/d3d11va.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/dirac.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/dv_profile.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/dxva2.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/jni.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/mediacodec.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/qsv.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/vaapi.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/vdpau.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/version.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/videotoolbox.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/vorbis_parser.h");
            Paths.tryUnlink("/usr/local/include/libavcodec/xvmc.h");

            if (Paths.isEmpty("/usr/local/include/libavcodec")) removeSync("/usr/local/include/libavcodec");

            console.log("removing libavdevice includes");

            Paths.tryUnlink("/usr/local/include/libavdevice/avdevice.h");
            Paths.tryUnlink("/usr/local/include/libavdevice/version.h");

            if (Paths.isEmpty("/usr/local/include/libavdevice")) removeSync("/usr/local/include/libavdevice");

            console.log("removing libavfilter includes");

            Paths.tryUnlink("/usr/local/include/libavfilter/avfilter.h");
            Paths.tryUnlink("/usr/local/include/libavfilter/buffersink.h");
            Paths.tryUnlink("/usr/local/include/libavfilter/buffersrc.h");
            Paths.tryUnlink("/usr/local/include/libavfilter/version.h");

            if (Paths.isEmpty("/usr/local/include/libavfilter")) removeSync("/usr/local/include/libavfilter");

            console.log("removing libavformat includes");

            Paths.tryUnlink("/usr/local/include/libavformat/avformat.h");
            Paths.tryUnlink("/usr/local/include/libavformat/avio.h");
            Paths.tryUnlink("/usr/local/include/libavformat/version.h");

            if (Paths.isEmpty("/usr/local/include/libavformat")) removeSync("/usr/local/include/libavformat");

            console.log("removing libavutil includes");

            Paths.tryUnlink("/usr/local/include/libavutil/adler32.h");
            Paths.tryUnlink("/usr/local/include/libavutil/aes.h");
            Paths.tryUnlink("/usr/local/include/libavutil/aes_ctr.h");
            Paths.tryUnlink("/usr/local/include/libavutil/attributes.h");
            Paths.tryUnlink("/usr/local/include/libavutil/audio_fifo.h");
            Paths.tryUnlink("/usr/local/include/libavutil/avassert.h");
            Paths.tryUnlink("/usr/local/include/libavutil/avconfig.h");
            Paths.tryUnlink("/usr/local/include/libavutil/avstring.h");
            Paths.tryUnlink("/usr/local/include/libavutil/avutil.h");
            Paths.tryUnlink("/usr/local/include/libavutil/base64.h");
            Paths.tryUnlink("/usr/local/include/libavutil/blowfish.h");
            Paths.tryUnlink("/usr/local/include/libavutil/bprint.h");
            Paths.tryUnlink("/usr/local/include/libavutil/bswap.h");
            Paths.tryUnlink("/usr/local/include/libavutil/buffer.h");
            Paths.tryUnlink("/usr/local/include/libavutil/camellia.h");
            Paths.tryUnlink("/usr/local/include/libavutil/cast5.h");
            Paths.tryUnlink("/usr/local/include/libavutil/channel_layout.h");
            Paths.tryUnlink("/usr/local/include/libavutil/common.h");
            Paths.tryUnlink("/usr/local/include/libavutil/cpu.h");
            Paths.tryUnlink("/usr/local/include/libavutil/crc.h");
            Paths.tryUnlink("/usr/local/include/libavutil/des.h");
            Paths.tryUnlink("/usr/local/include/libavutil/dict.h");
            Paths.tryUnlink("/usr/local/include/libavutil/display.h");
            Paths.tryUnlink("/usr/local/include/libavutil/downmix_info.h");
            Paths.tryUnlink("/usr/local/include/libavutil/encryption_info.h");
            Paths.tryUnlink("/usr/local/include/libavutil/error.h");
            Paths.tryUnlink("/usr/local/include/libavutil/eval.h");
            Paths.tryUnlink("/usr/local/include/libavutil/ffversion.h");
            Paths.tryUnlink("/usr/local/include/libavutil/fifo.h");
            Paths.tryUnlink("/usr/local/include/libavutil/file.h");
            Paths.tryUnlink("/usr/local/include/libavutil/frame.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hash.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hdr_dynamic_metadata.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hmac.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_cuda.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_d3d11va.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_drm.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_dxva2.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_mediacodec.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_qsv.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_vaapi.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_vdpau.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_videotoolbox.h");
            Paths.tryUnlink("/usr/local/include/libavutil/hwcontext_vulkan.h");
            Paths.tryUnlink("/usr/local/include/libavutil/imgutils.h");
            Paths.tryUnlink("/usr/local/include/libavutil/intfloat.h");
            Paths.tryUnlink("/usr/local/include/libavutil/intreadwrite.h");
            Paths.tryUnlink("/usr/local/include/libavutil/lfg.h");
            Paths.tryUnlink("/usr/local/include/libavutil/log.h");
            Paths.tryUnlink("/usr/local/include/libavutil/lzo.h");
            Paths.tryUnlink("/usr/local/include/libavutil/macros.h");
            Paths.tryUnlink("/usr/local/include/libavutil/mastering_display_metadata.h");
            Paths.tryUnlink("/usr/local/include/libavutil/mathematics.h");
            Paths.tryUnlink("/usr/local/include/libavutil/md5.h");
            Paths.tryUnlink("/usr/local/include/libavutil/mem.h");
            Paths.tryUnlink("/usr/local/include/libavutil/motion_vector.h");
            Paths.tryUnlink("/usr/local/include/libavutil/murmur3.h");
            Paths.tryUnlink("/usr/local/include/libavutil/opt.h");
            Paths.tryUnlink("/usr/local/include/libavutil/parseutils.h");
            Paths.tryUnlink("/usr/local/include/libavutil/pixdesc.h");
            Paths.tryUnlink("/usr/local/include/libavutil/pixelutils.h");
            Paths.tryUnlink("/usr/local/include/libavutil/pixfmt.h");
            Paths.tryUnlink("/usr/local/include/libavutil/random_seed.h");
            Paths.tryUnlink("/usr/local/include/libavutil/rational.h");
            Paths.tryUnlink("/usr/local/include/libavutil/rc4.h");
            Paths.tryUnlink("/usr/local/include/libavutil/replaygain.h");
            Paths.tryUnlink("/usr/local/include/libavutil/ripemd.h");
            Paths.tryUnlink("/usr/local/include/libavutil/samplefmt.h");
            Paths.tryUnlink("/usr/local/include/libavutil/sha.h");
            Paths.tryUnlink("/usr/local/include/libavutil/sha512.h");
            Paths.tryUnlink("/usr/local/include/libavutil/spherical.h");
            Paths.tryUnlink("/usr/local/include/libavutil/stereo3d.h");
            Paths.tryUnlink("/usr/local/include/libavutil/tea.h");
            Paths.tryUnlink("/usr/local/include/libavutil/threadmessage.h");
            Paths.tryUnlink("/usr/local/include/libavutil/time.h");
            Paths.tryUnlink("/usr/local/include/libavutil/timecode.h");
            Paths.tryUnlink("/usr/local/include/libavutil/timestamp.h");
            Paths.tryUnlink("/usr/local/include/libavutil/tree.h");
            Paths.tryUnlink("/usr/local/include/libavutil/twofish.h");
            Paths.tryUnlink("/usr/local/include/libavutil/tx.h");
            Paths.tryUnlink("/usr/local/include/libavutil/version.h");
            Paths.tryUnlink("/usr/local/include/libavutil/xtea.h");

            if (Paths.isEmpty("/usr/local/include/libavutil")) removeSync("/usr/local/include/libavutil");

            console.log("removing libpostproc includes");

            Paths.tryUnlink("/usr/local/include/libpostproc/postprocess.h");
            Paths.tryUnlink("/usr/local/include/libpostproc/version.h");

            if (Paths.isEmpty("/usr/local/include/libpostproc")) removeSync("/usr/local/include/libpostproc");

            console.log("removing libswresample includes");

            Paths.tryUnlink("/usr/local/include/libswresample/swresample.h");
            Paths.tryUnlink("/usr/local/include/libswresample/version.h");

            if (Paths.isEmpty("/usr/local/include/libswresample")) removeSync("/usr/local/include/libswresample");

            console.log("removing libswscale includes");

            Paths.tryUnlink("/usr/local/include/libswscale/swscale.h");
            Paths.tryUnlink("/usr/local/include/libswscale/version.h");

            if (Paths.isEmpty("/usr/local/include/libswscale")) removeSync("/usr/local/include/libswscale");

            console.log("removing ffmpeg codecs");

            Paths.tryUnlink("/usr/local/lib/libavcodec.a");
            Paths.tryUnlink("/usr/local/lib/libavdevice.a");
            Paths.tryUnlink("/usr/local/lib/libavfilter.a");
            Paths.tryUnlink("/usr/local/lib/libavformat.a");
            Paths.tryUnlink("/usr/local/lib/libavutil.a");
            Paths.tryUnlink("/usr/local/lib/libfdk-aac.a");
            Paths.tryUnlink("/usr/local/lib/libfdk-aac.la");
            Paths.tryUnlink("/usr/local/lib/libfdk-aac.so");
            Paths.tryUnlink("/usr/local/lib/libfdk-aac.so.2");
            Paths.tryUnlink("/usr/local/lib/libfdk-aac.so.2.0.1");
            Paths.tryUnlink("/usr/local/lib/libpostproc.a");
            Paths.tryUnlink("/usr/local/lib/libswresample.a");
            Paths.tryUnlink("/usr/local/lib/libswscale.a");

            console.log("removing ffmpeg pkgconfig");

            Paths.tryUnlink("/usr/local/lib/pkgconfig/fdk-aac.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libavcodec.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libavdevice.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libavfilter.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libavformat.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libavutil.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libpostproc.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libswresample.pc");
            Paths.tryUnlink("/usr/local/lib/pkgconfig/libswscale.pc");

            console.log("removing ffmpeg examples");

            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/Makefile");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/README");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/avio_dir_cmd.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/avio_reading.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/decode_audio.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/decode_video.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/demuxing_decoding.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/encode_audio.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/encode_video.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/extract_mvs.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/filter_audio.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/filtering_audio.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/filtering_video.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/http_multiclient.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/hw_decode.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/metadata.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/muxing.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/qsvdec.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/remuxing.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/resampling_audio.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/scaling_video.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/transcode_aac.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/transcoding.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/vaapi_encode.c");
            Paths.tryUnlink("/usr/local/share/ffmpeg/examples/vaapi_transcode.c");

            if (Paths.isEmpty("/usr/local/share/ffmpeg/examples")) removeSync("/usr/local/share/ffmpeg/examples");

            console.log("removing ffmpeg shared");

            Paths.tryUnlink("/usr/local/share/ffmpeg/ffprobe.xsd");
            Paths.tryUnlink("/usr/local/share/ffmpeg/libvpx-1080p.ffpreset");
            Paths.tryUnlink("/usr/local/share/ffmpeg/libvpx-1080p50_60.ffpreset");
            Paths.tryUnlink("/usr/local/share/ffmpeg/libvpx-360p.ffpreset");
            Paths.tryUnlink("/usr/local/share/ffmpeg/libvpx-720p.ffpreset");
            Paths.tryUnlink("/usr/local/share/ffmpeg/libvpx-720p50_60.ffpreset");

            if (Paths.isEmpty("/usr/local/share/ffmpeg")) removeSync("/usr/local/share/ffmpeg");

            console.log("removing ffmpeg man pages");

            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-all.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-bitstream-filters.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-codecs.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-devices.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-filters.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-formats.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-protocols.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-resampler.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-scaler.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg-utils.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffmpeg.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffprobe-all.1");
            Paths.tryUnlink("/usr/local/share/man/man1/ffprobe.1");

            Paths.tryUnlink("/usr/local/share/man/man3/libavcodec.3");
            Paths.tryUnlink("/usr/local/share/man/man3/libavdevice.3");
            Paths.tryUnlink("/usr/local/share/man/man3/libavfilter.3");
            Paths.tryUnlink("/usr/local/share/man/man3/libavformat.3");
            Paths.tryUnlink("/usr/local/share/man/man3/libavutil.3");
            Paths.tryUnlink("/usr/local/share/man/man3/libswresample.3");
            Paths.tryUnlink("/usr/local/share/man/man3/libswscale.3");

            Console.notify(
                "hub",
                "FFMPEG Removed",
                "FFMPEG has been removed.",
                NotificationType.WARN,
                "build",
            );

            return {
                success: true,
            };
        }

        Console.notify(
            "hub",
            "FFMPEG Not Removed",
            "This can only remove FFMPEG installed by HOOBS.",
            NotificationType.ERROR,
        );

        return {
            success: false,
            error: "this can only remove ffmpeg installed by hoobs",
        };
    }
}
