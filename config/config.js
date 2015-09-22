module.exports = {
	libvirt: {
		hypervisor: {
			uri: "qemu+ssh://root@orthanc/system"
			, type: "qemu"
		}
	}
    , https: {
        key: "./local/httpskey.pem"
        , cert: "./local/httpscert.pem"
    }
};
