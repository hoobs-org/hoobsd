# ![](https://raw.githubusercontent.com/hoobs-org/HOOBS/master/docs/logo.png)

The HOOBS server daemon is the software that creates and runs bridge instances.


## Installing
HOOBS recommends Yarn.

```sh
yarn global add --unsafe-perm @hoobs/hoobsd
```

Or using NPM.

```sh
npm install -g --unsafe-perm @hoobs/hoobsd
```

To manage the HOOBS daemon, you will need to install the CLI.

```sh
yarn global add --unsafe-perm @hoobs/cli
```

Or using NPM.

```sh
npm install -g --unsafe-perm @hoobs/cli
```

> The `--unsafe-perm` flag needs to be used so the install can add a symlink in `/usr/bin`.

## Usage
To start using HOOBS you will first need to initilize the system.

```
sudo hoobs initilize
```

You will be asked to set a port. Then if you have systemd or launchd on the system this will automatically set this up to run on start.

## Documentation
The hoobsd CLI & API documentation can be found here.  
[CLI Documentation](https://github.com/hoobs-org/HOOBS/blob/main/docs/CLI.md)  
[API Documentation](https://github.com/hoobs-org/HOOBS/blob/main/docs/API.md)  