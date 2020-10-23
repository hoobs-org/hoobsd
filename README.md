# ![](https://raw.githubusercontent.com/hoobs-org/HOOBS/master/docs/logo.png)

The HOOBS server daemon is the software that creates and runs bridge instances. It communicates with the HAP server and installed plugins. It also serves an API that can be consumed by client applications. Below is a list of the commands for hoobsd.

## **start**
This starts instances. It is also the default command when no other command is defined.

```
sudo hoobsd start -i 'my-instance'
```

Available options
| Flag                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| -d, --debug           | Turn on debug level logging                         |
| -v, --verbose         | Tuen on insane verbose logging                      |
| -i, --instance <name> | Define the instance to start, can be the name or id |
| -p, --port <port>     | Override the port defined on the instance           |
| -o, --orphans         | Keep cached accessories for orphaned plugins        |
| -c, --container       | This changes the paths needed for Docker containers |

> If an instance name is not included the default is **default**

## **api**
This starts the control api. This is needed to manage the instances.

```
sudo hoobsd api
```

Available options
| Flag                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| -d, --debug           | Turn on debug level logging                         |
| -v, --verbose         | Tuen on insane verbose logging                      |
| -p, --port <port>     | Override the defined API port                       |
| -c, --container       | This changes the paths needed for Docker containers |

## **service <action>**
This controls the services installed on teh system. To create the services use the HOOBS CLI.

> If you do not define an instance the default is **default**, also to control the API service, the instance name is **api**.

```
sudo hoobsd service start -i 'my-instance'
```

Available actions
| Action  | Description                            |
| ------- | -------------------------------------- |
| start   | This will start the defined instance   |
| stop    | This will stop the defined instance    |
| restart | This will restart the defined instance |

Available options
| Flag                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| -d, --debug           | Turn on debug level logging                         |
| -i, --instance <name> | Define the instance to start, can be the name or id |
