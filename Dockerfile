FROM mendix/rootfs:bionic

COPY ./releases/App_1.0.0.87629540.mda /srv/mendix/app.mda

COPY ./modeler/mxbuild.exe /srv/mendix/

ENTRYPOINT [ "/srv/mendix/mxbuild.exe" ]

RUN mxbuild --output-dir /srv/mendix/ --java-home /usr/lib/jvm/zulu-11/

