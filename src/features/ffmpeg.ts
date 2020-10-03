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
import Paths from "../shared/paths";
import { Console, NotificationType } from "../shared/logger";
import { findCommand, tryUnlink, isDirectoryEmpty } from "../shared/helpers";

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

        if ((utsname.sysname || "").toLowerCase() === "linux" && ((utsname.machine || "").toLowerCase() === "armv7l" || (utsname.machine || "").toLowerCase() === "aarch64") && findCommand("apt-get")) {
            execSync("apt-get update", options);
            execSync(`apt-get install -y ${packages.join(" ")}`, options);
            execSync(`wget ${download}`, options);
            execSync("tar -xzf ./ffmpeg.tar.gz -C /usr/local --strip-components=1 --no-same-owner", options);
            execSync("rm -f ./ffmpeg.tar.gz", options);
            execSync("ldconfig -n /usr/local/lib", options);
            execSync("ldconfig", options);

            Console.notify(
                "enable_feature",
                "api",
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
                "enable_feature",
                "api",
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
                "enable_feature",
                "api",
                "FFMPEG Not Installed",
                "This version of FFMPEG is only supported on ARM processors.",
                NotificationType.ERROR,
            );

            return {
                success: false,
                error: "this version of ffmpeg is only supported on arm processors",
            };
        }

        if (!findCommand("apt-get")) {
            Console.notify(
                "enable_feature",
                "api",
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

        if ((utsname.sysname || "").toLowerCase() === "linux" && ((utsname.machine || "").toLowerCase() === "armv7l" || (utsname.machine || "").toLowerCase() === "aarch64") && findCommand("apt-get")) {
            console.log("removing ffmpeg binaries");

            tryUnlink("/usr/local/bin/ffmpeg");
            tryUnlink("/usr/local/bin/ffprobe");

            console.log("removing fdk-aac includes");

            tryUnlink("/usr/local/include/fdk-aac/FDK_audio.h");
            tryUnlink("/usr/local/include/fdk-aac/aacdecoder_lib.h");
            tryUnlink("/usr/local/include/fdk-aac/aacenc_lib.h");
            tryUnlink("/usr/local/include/fdk-aac/genericStds.h");
            tryUnlink("/usr/local/include/fdk-aac/machine_type.h");
            tryUnlink("/usr/local/include/fdk-aac/syslib_channelMapDescr.h");

            if (isDirectoryEmpty("/usr/local/include/fdk-aac")) removeSync("/usr/local/include/fdk-aac");

            console.log("removing libavcodec includes");

            tryUnlink("/usr/local/include/libavcodec/ac3_parser.h");
            tryUnlink("/usr/local/include/libavcodec/adts_parser.h");
            tryUnlink("/usr/local/include/libavcodec/avcodec.h");
            tryUnlink("/usr/local/include/libavcodec/avdct.h");
            tryUnlink("/usr/local/include/libavcodec/avfft.h");
            tryUnlink("/usr/local/include/libavcodec/d3d11va.h");
            tryUnlink("/usr/local/include/libavcodec/dirac.h");
            tryUnlink("/usr/local/include/libavcodec/dv_profile.h");
            tryUnlink("/usr/local/include/libavcodec/dxva2.h");
            tryUnlink("/usr/local/include/libavcodec/jni.h");
            tryUnlink("/usr/local/include/libavcodec/mediacodec.h");
            tryUnlink("/usr/local/include/libavcodec/qsv.h");
            tryUnlink("/usr/local/include/libavcodec/vaapi.h");
            tryUnlink("/usr/local/include/libavcodec/vdpau.h");
            tryUnlink("/usr/local/include/libavcodec/version.h");
            tryUnlink("/usr/local/include/libavcodec/videotoolbox.h");
            tryUnlink("/usr/local/include/libavcodec/vorbis_parser.h");
            tryUnlink("/usr/local/include/libavcodec/xvmc.h");

            if (isDirectoryEmpty("/usr/local/include/libavcodec")) removeSync("/usr/local/include/libavcodec");

            console.log("removing libavdevice includes");

            tryUnlink("/usr/local/include/libavdevice/avdevice.h");
            tryUnlink("/usr/local/include/libavdevice/version.h");

            if (isDirectoryEmpty("/usr/local/include/libavdevice")) removeSync("/usr/local/include/libavdevice");

            console.log("removing libavfilter includes");

            tryUnlink("/usr/local/include/libavfilter/avfilter.h");
            tryUnlink("/usr/local/include/libavfilter/buffersink.h");
            tryUnlink("/usr/local/include/libavfilter/buffersrc.h");
            tryUnlink("/usr/local/include/libavfilter/version.h");

            if (isDirectoryEmpty("/usr/local/include/libavfilter")) removeSync("/usr/local/include/libavfilter");

            console.log("removing libavformat includes");

            tryUnlink("/usr/local/include/libavformat/avformat.h");
            tryUnlink("/usr/local/include/libavformat/avio.h");
            tryUnlink("/usr/local/include/libavformat/version.h");

            if (isDirectoryEmpty("/usr/local/include/libavformat")) removeSync("/usr/local/include/libavformat");

            console.log("removing libavutil includes");

            tryUnlink("/usr/local/include/libavutil/adler32.h");
            tryUnlink("/usr/local/include/libavutil/aes.h");
            tryUnlink("/usr/local/include/libavutil/aes_ctr.h");
            tryUnlink("/usr/local/include/libavutil/attributes.h");
            tryUnlink("/usr/local/include/libavutil/audio_fifo.h");
            tryUnlink("/usr/local/include/libavutil/avassert.h");
            tryUnlink("/usr/local/include/libavutil/avconfig.h");
            tryUnlink("/usr/local/include/libavutil/avstring.h");
            tryUnlink("/usr/local/include/libavutil/avutil.h");
            tryUnlink("/usr/local/include/libavutil/base64.h");
            tryUnlink("/usr/local/include/libavutil/blowfish.h");
            tryUnlink("/usr/local/include/libavutil/bprint.h");
            tryUnlink("/usr/local/include/libavutil/bswap.h");
            tryUnlink("/usr/local/include/libavutil/buffer.h");
            tryUnlink("/usr/local/include/libavutil/camellia.h");
            tryUnlink("/usr/local/include/libavutil/cast5.h");
            tryUnlink("/usr/local/include/libavutil/channel_layout.h");
            tryUnlink("/usr/local/include/libavutil/common.h");
            tryUnlink("/usr/local/include/libavutil/cpu.h");
            tryUnlink("/usr/local/include/libavutil/crc.h");
            tryUnlink("/usr/local/include/libavutil/des.h");
            tryUnlink("/usr/local/include/libavutil/dict.h");
            tryUnlink("/usr/local/include/libavutil/display.h");
            tryUnlink("/usr/local/include/libavutil/downmix_info.h");
            tryUnlink("/usr/local/include/libavutil/encryption_info.h");
            tryUnlink("/usr/local/include/libavutil/error.h");
            tryUnlink("/usr/local/include/libavutil/eval.h");
            tryUnlink("/usr/local/include/libavutil/ffversion.h");
            tryUnlink("/usr/local/include/libavutil/fifo.h");
            tryUnlink("/usr/local/include/libavutil/file.h");
            tryUnlink("/usr/local/include/libavutil/frame.h");
            tryUnlink("/usr/local/include/libavutil/hash.h");
            tryUnlink("/usr/local/include/libavutil/hdr_dynamic_metadata.h");
            tryUnlink("/usr/local/include/libavutil/hmac.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_cuda.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_d3d11va.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_drm.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_dxva2.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_mediacodec.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_qsv.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_vaapi.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_vdpau.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_videotoolbox.h");
            tryUnlink("/usr/local/include/libavutil/hwcontext_vulkan.h");
            tryUnlink("/usr/local/include/libavutil/imgutils.h");
            tryUnlink("/usr/local/include/libavutil/intfloat.h");
            tryUnlink("/usr/local/include/libavutil/intreadwrite.h");
            tryUnlink("/usr/local/include/libavutil/lfg.h");
            tryUnlink("/usr/local/include/libavutil/log.h");
            tryUnlink("/usr/local/include/libavutil/lzo.h");
            tryUnlink("/usr/local/include/libavutil/macros.h");
            tryUnlink("/usr/local/include/libavutil/mastering_display_metadata.h");
            tryUnlink("/usr/local/include/libavutil/mathematics.h");
            tryUnlink("/usr/local/include/libavutil/md5.h");
            tryUnlink("/usr/local/include/libavutil/mem.h");
            tryUnlink("/usr/local/include/libavutil/motion_vector.h");
            tryUnlink("/usr/local/include/libavutil/murmur3.h");
            tryUnlink("/usr/local/include/libavutil/opt.h");
            tryUnlink("/usr/local/include/libavutil/parseutils.h");
            tryUnlink("/usr/local/include/libavutil/pixdesc.h");
            tryUnlink("/usr/local/include/libavutil/pixelutils.h");
            tryUnlink("/usr/local/include/libavutil/pixfmt.h");
            tryUnlink("/usr/local/include/libavutil/random_seed.h");
            tryUnlink("/usr/local/include/libavutil/rational.h");
            tryUnlink("/usr/local/include/libavutil/rc4.h");
            tryUnlink("/usr/local/include/libavutil/replaygain.h");
            tryUnlink("/usr/local/include/libavutil/ripemd.h");
            tryUnlink("/usr/local/include/libavutil/samplefmt.h");
            tryUnlink("/usr/local/include/libavutil/sha.h");
            tryUnlink("/usr/local/include/libavutil/sha512.h");
            tryUnlink("/usr/local/include/libavutil/spherical.h");
            tryUnlink("/usr/local/include/libavutil/stereo3d.h");
            tryUnlink("/usr/local/include/libavutil/tea.h");
            tryUnlink("/usr/local/include/libavutil/threadmessage.h");
            tryUnlink("/usr/local/include/libavutil/time.h");
            tryUnlink("/usr/local/include/libavutil/timecode.h");
            tryUnlink("/usr/local/include/libavutil/timestamp.h");
            tryUnlink("/usr/local/include/libavutil/tree.h");
            tryUnlink("/usr/local/include/libavutil/twofish.h");
            tryUnlink("/usr/local/include/libavutil/tx.h");
            tryUnlink("/usr/local/include/libavutil/version.h");
            tryUnlink("/usr/local/include/libavutil/xtea.h");

            if (isDirectoryEmpty("/usr/local/include/libavutil")) removeSync("/usr/local/include/libavutil");

            console.log("removing libpostproc includes");

            tryUnlink("/usr/local/include/libpostproc/postprocess.h");
            tryUnlink("/usr/local/include/libpostproc/version.h");

            if (isDirectoryEmpty("/usr/local/include/libpostproc")) removeSync("/usr/local/include/libpostproc");

            console.log("removing libswresample includes");

            tryUnlink("/usr/local/include/libswresample/swresample.h");
            tryUnlink("/usr/local/include/libswresample/version.h");

            if (isDirectoryEmpty("/usr/local/include/libswresample")) removeSync("/usr/local/include/libswresample");

            console.log("removing libswscale includes");

            tryUnlink("/usr/local/include/libswscale/swscale.h");
            tryUnlink("/usr/local/include/libswscale/version.h");

            if (isDirectoryEmpty("/usr/local/include/libswscale")) removeSync("/usr/local/include/libswscale");

            console.log("removing ffmpeg codecs");

            tryUnlink("/usr/local/lib/libavcodec.a");
            tryUnlink("/usr/local/lib/libavdevice.a");
            tryUnlink("/usr/local/lib/libavfilter.a");
            tryUnlink("/usr/local/lib/libavformat.a");
            tryUnlink("/usr/local/lib/libavutil.a");
            tryUnlink("/usr/local/lib/libfdk-aac.a");
            tryUnlink("/usr/local/lib/libfdk-aac.la");
            tryUnlink("/usr/local/lib/libfdk-aac.so");
            tryUnlink("/usr/local/lib/libfdk-aac.so.2");
            tryUnlink("/usr/local/lib/libfdk-aac.so.2.0.1");
            tryUnlink("/usr/local/lib/libpostproc.a");
            tryUnlink("/usr/local/lib/libswresample.a");
            tryUnlink("/usr/local/lib/libswscale.a");

            console.log("removing ffmpeg pkgconfig");

            tryUnlink("/usr/local/lib/pkgconfig/fdk-aac.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libavcodec.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libavdevice.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libavfilter.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libavformat.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libavutil.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libpostproc.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libswresample.pc");
            tryUnlink("/usr/local/lib/pkgconfig/libswscale.pc");

            console.log("removing ffmpeg examples");

            tryUnlink("/usr/local/share/ffmpeg/examples/Makefile");
            tryUnlink("/usr/local/share/ffmpeg/examples/README");
            tryUnlink("/usr/local/share/ffmpeg/examples/avio_dir_cmd.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/avio_reading.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/decode_audio.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/decode_video.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/demuxing_decoding.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/encode_audio.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/encode_video.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/extract_mvs.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/filter_audio.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/filtering_audio.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/filtering_video.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/http_multiclient.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/hw_decode.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/metadata.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/muxing.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/qsvdec.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/remuxing.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/resampling_audio.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/scaling_video.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/transcode_aac.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/transcoding.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/vaapi_encode.c");
            tryUnlink("/usr/local/share/ffmpeg/examples/vaapi_transcode.c");

            if (isDirectoryEmpty("/usr/local/share/ffmpeg/examples")) removeSync("/usr/local/share/ffmpeg/examples");

            console.log("removing ffmpeg shared");

            tryUnlink("/usr/local/share/ffmpeg/ffprobe.xsd");
            tryUnlink("/usr/local/share/ffmpeg/libvpx-1080p.ffpreset");
            tryUnlink("/usr/local/share/ffmpeg/libvpx-1080p50_60.ffpreset");
            tryUnlink("/usr/local/share/ffmpeg/libvpx-360p.ffpreset");
            tryUnlink("/usr/local/share/ffmpeg/libvpx-720p.ffpreset");
            tryUnlink("/usr/local/share/ffmpeg/libvpx-720p50_60.ffpreset");

            if (isDirectoryEmpty("/usr/local/share/ffmpeg")) removeSync("/usr/local/share/ffmpeg");

            console.log("removing ffmpeg man pages");

            tryUnlink("/usr/local/share/man/man1/ffmpeg-all.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-bitstream-filters.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-codecs.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-devices.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-filters.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-formats.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-protocols.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-resampler.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-scaler.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg-utils.1");
            tryUnlink("/usr/local/share/man/man1/ffmpeg.1");
            tryUnlink("/usr/local/share/man/man1/ffprobe-all.1");
            tryUnlink("/usr/local/share/man/man1/ffprobe.1");

            tryUnlink("/usr/local/share/man/man3/libavcodec.3");
            tryUnlink("/usr/local/share/man/man3/libavdevice.3");
            tryUnlink("/usr/local/share/man/man3/libavfilter.3");
            tryUnlink("/usr/local/share/man/man3/libavformat.3");
            tryUnlink("/usr/local/share/man/man3/libavutil.3");
            tryUnlink("/usr/local/share/man/man3/libswresample.3");
            tryUnlink("/usr/local/share/man/man3/libswscale.3");

            Console.notify(
                "disable_feature",
                "api",
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
            "disable_feature",
            "api",
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
