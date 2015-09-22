# stargate-vmagent
nodejs REST server / API for managing libvirt-based Virtual Machines

This is intended as a small-footprint "agent" for providing some
basic management functions for Virtual Machines 
implemented behind the libvirt API (such as qemu). It's not intended as a 
full-fledged API like libvirt.

The initial list of functions to be supported are:
* Power cycle VM
* Set a temporary graphics (spice/vnc) password

## Permissioning agent to access libvirt API

For example this in /etc/polkit-1/rules.d/80-libvirt.rules:

```javascript
polkit.addRule(function(action, subject) {
  if (action.id == "org.libvirt.unix.manage" && subject.local && subject.active && subject.user == "xyz") {
      return polkit.Result.YES;
  }
});
```