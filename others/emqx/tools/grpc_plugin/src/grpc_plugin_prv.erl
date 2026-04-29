-module(grpc_plugin_prv).

-export([init/1, do/1, format_error/1]).

-include_lib("providers/include/providers.hrl").

-define(PROVIDER, gen).
-define(NAMESPACE, grpc).
-define(DEPS, [{default, app_discovery}]).

-spec init(rebar_state:t()) -> {ok, rebar_state:t()}.
init(State) ->
    Provider = providers:create(
                 [{name, ?PROVIDER},
                  {namespace, ?NAMESPACE},
                  {module, ?MODULE},
                  {bare, true},
                  {deps, ?DEPS},
                  {example, "rebar3 grpc gen"},
                  {opts, [{protos, $p, "protos", string,
                           "directory of protos to build"},
                          {force, $f, "force", boolean,
                           "overwrite already generated modules"},
                          {type, $t, "type", string,
                           "generate 'client', 'server' or 'all'"}]},
                  {short_desc, "Generates behaviours for grpc services"},
                  {desc, "Generates behaviours for grpc services"}]),
    {ok, rebar_state:add_provider(State, Provider)}.

-spec do(rebar_state:t()) -> {ok, rebar_state:t()} | {error, string()}.
do(State) ->
    Apps = case rebar_state:current_app(State) of
               undefined ->
                   rebar_state:project_apps(State);
               AppInfo ->
                   [AppInfo]
           end,
    {Options, _} = rebar_state:command_parsed_args(State),
    lists:foreach(fun(AppInfo) ->
        handle_app(AppInfo, Options, State)
    end, Apps),
    {ok, State}.

-spec format_error(any()) -> iolist().
format_error({compile_errors, Errors}) ->
    [[io_lib:format("Error building ~s~n", [File]) |
      [io_lib:format("        ~p: ~s", [Line, M:format_error(E)])
       || {Line, M, E} <- Es]]
     || {File, Es} <- Errors];
format_error({gpb, File, Error}) ->
    io_lib:format("Error compiling proto file ~s ~s",
                  [filename:basename(File), gpb_compile:format_error(Error)]);
format_error({invalid_type, Type}) ->
    io_lib:format("Unsupported grpc generation type: ~p", [Type]);
format_error(Reason) ->
    io_lib:format("~p", [Reason]).

handle_app(AppInfo, Options, State) ->
    Opts = rebar_app_info:opts(AppInfo),
    BeamOutDir = rebar_app_info:ebin_dir(AppInfo),
    GrpcOpts = rebar_opts:get(Opts, grpc, []),
    GpbOpts = proplists:get_value(gpb_opts, GrpcOpts, []),
    BaseDir = rebar_app_info:dir(AppInfo),
    GrpcOptOutDir = proplists:get_value(out_dir, GrpcOpts, "src"),
    GrpcOutDir = filename:join(BaseDir, GrpcOptOutDir),
    GpbOutDir = filename:join(BaseDir,
                              proplists:get_value(o, GpbOpts, GrpcOptOutDir)),
    ProtosDirs = normalize_dirs(
                  proplists:get_value(
                    protos,
                    Options,
                    proplists:get_value(protos,
                                        GrpcOpts,
                                        [filename:join("priv", "protos")]))),
    ProtoFiles = lists:append(
                   [filelib:wildcard(filename:join([BaseDir, Dir, "*.proto"]))
                    || Dir <- ProtosDirs]),
    Type = normalize_type(
             proplists:get_value(type,
                                 Options,
                                 proplists:get_value(type, GrpcOpts, all))),
    Force = proplists:get_value(force, Options, false),
    Templates = templates(Type),
    ProtoModules = [compile_pb(Filename, GpbOutDir, BeamOutDir, GpbOpts)
                    || Filename <- ProtoFiles],
    [gen_services(Templates,
                  Force,
                  ProtoModule,
                  ProtoBeam,
                  GrpcOutDir,
                  GrpcOpts,
                  State)
     || {ProtoModule, ProtoBeam} <- ProtoModules],
    ok.

normalize_dirs([H | _] = Dirs) when is_list(H) ->
    Dirs;
normalize_dirs(Dir) ->
    [Dir].

compile_pb(Filename, OutDir, BeamOutDir, GpbOpts) ->
    ModuleName = lists:flatten(
                   [proplists:get_value(module_name_prefix, GpbOpts, ""),
                    filename:basename(Filename, ".proto"),
                    proplists:get_value(module_name_suffix, GpbOpts, "")]),
    GeneratedPB = filename:join(OutDir, ModuleName ++ ".erl"),
    CompiledPB = filename:join(BeamOutDir, ModuleName ++ ".beam"),
    ok = filelib:ensure_dir(GeneratedPB),
    ok = filelib:ensure_dir(CompiledPB),
    case needs_update(Filename, GeneratedPB) of
        true ->
            rebar_log:log(info, "Writing ~s", [GeneratedPB]),
            case gpb_compile:file(Filename, [{rename, {msg_name, snake_case}},
                                             {rename, {msg_fqname, base_name}},
                                             use_packages,
                                             maps,
                                             strings_as_binaries,
                                             {i, "."},
                                             {report_errors, false},
                                             {o, OutDir} | GpbOpts]) of
                ok ->
                    ok;
                {error, Error} ->
                    erlang:error(?PRV_ERROR({gpb, Filename, Error}))
            end;
        false ->
            rebar_api:debug("Already latest pb file: ~s, skip compiling it",
                            [CompiledPB]),
            ok
    end,
    case needs_update(GeneratedPB, CompiledPB) of
        true ->
            GpbIncludeDir = filename:join(code:lib_dir(gpb), "include"),
            case compile:file(GeneratedPB, [{outdir, BeamOutDir},
                                            {i, GpbIncludeDir},
                                            return_errors]) of
                {ok, _} ->
                    ok;
                {ok, _, Warnings} ->
                    log_warnings(Warnings),
                    ok;
                {error, Errors, Warnings} ->
                    log_warnings(Warnings),
                    throw(?PRV_ERROR({compile_errors, Errors}))
            end;
        false ->
            rebar_api:debug("Already latest compiled pb file: ~s, skip compiling it",
                            [CompiledPB]),
            ok
    end,
    _ = code:purge(list_to_atom(ModuleName)),
    {module, Module} = code:load_abs(filename:join(BeamOutDir, ModuleName)),
    {Module, CompiledPB}.

gen_services(Templates, Force, ProtoModule, ProtoBeam, OutDir, GrpcConfig, State) ->
    ServiceDefs = [gen_service_def(Service, ProtoModule, GrpcConfig, OutDir)
                   || Service <- ProtoModule:get_service_names()],
    WithTemplates = [{ServiceDef, TemplateSuffix, TemplateName}
                     || ServiceDef <- ServiceDefs,
                        {TemplateSuffix, TemplateName} <- Templates],
    Services = case Force of
                   true ->
                       WithTemplates;
                   false ->
                       lists:filter(fun(Service) ->
                           filter_outdated(Service, OutDir, ProtoBeam)
                       end, WithTemplates)
               end,
    rebar_log:log(debug, "services: ~p", [Services]),
    [rebar_templater:new(TemplateName, maps:to_list(ServiceDef), Force, State)
     || {ServiceDef, _, TemplateName} <- Services].

gen_service_def(Service, ProtoModule, GrpcConfig, FullOutDir) ->
    ServiceModules = proplists:get_value(service_modules, GrpcConfig, []),
    ServicePrefix = proplists:get_value(prefix, GrpcConfig, ""),
    ServiceSuffix = proplists:get_value(suffix, GrpcConfig, ""),
    {{_, Name}, Methods} = ProtoModule:get_service_def(Service),
    ModuleName = proplists:get_value(Name,
                                     ServiceModules,
                                     list_snake_case(atom_to_list(Name))),
    #{out_dir => FullOutDir,
      pb_module => atom_to_list(ProtoModule),
      unmodified_service_name => atom_to_list(Name),
      module_name => ServicePrefix ++ ModuleName ++ ServiceSuffix,
      methods => [resolve_method(Method, ProtoModule) || Method <- Methods]}.

resolve_method(Method, ProtoModule) ->
    MessageType = {message_type,
                   ProtoModule:msg_name_to_fqbin(maps:get(input, Method))},
    MethodData = lists:flatmap(fun normalize_method_opt/1,
                               maps:to_list(Method)),
    [MessageType | MethodData].

filter_outdated({#{module_name := ModuleName}, TemplateSuffix, _},
                OutDir, ProtoBeam) ->
    ModulePath = filename:join([OutDir,
                                ModuleName ++ "_" ++ TemplateSuffix ++ ".erl"]),
    ok = filelib:ensure_dir(ModulePath),
    needs_update(ProtoBeam, ModulePath).

templates(S) when is_list(S) ->
    templates(normalize_type(S));
templates(all) ->
    [{"client", "grpc_service_client"},
     {"bhvr", "grpc_service_bhvr"}];
templates(client) ->
    [{"client", "grpc_service_client"}];
templates(server) ->
    [{"bhvr", "grpc_service_bhvr"}].

normalize_type(undefined) ->
    all;
normalize_type("all") ->
    all;
normalize_type("client") ->
    client;
normalize_type("server") ->
    server;
normalize_type(all) ->
    all;
normalize_type(client) ->
    client;
normalize_type(server) ->
    server;
normalize_type(Other) ->
    erlang:error(?PRV_ERROR({invalid_type, Other})).

normalize_method_opt({opts, _}) ->
    [];
normalize_method_opt({name, Name}) ->
    StrName = atom_to_list(Name),
    [{method, list_snake_case(StrName)},
     {unmodified_method, StrName}];
normalize_method_opt({K, V}) when V =:= true; V =:= false ->
    [{K, V}];
normalize_method_opt({K, V}) when is_atom(V) ->
    [{K, atom_to_list(V)}];
normalize_method_opt({K, V}) when is_binary(V) ->
    [{K, binary_to_list(V)}];
normalize_method_opt({K, V}) ->
    [{K, V}].

list_snake_case(NameString) ->
    Snaked = lists:foldl(
               fun(RE, Snaking) ->
                   re:replace(Snaking, RE, "\\1_\\2", [{return, list}, global])
               end,
               NameString,
               ["(.)([A-Z][a-z]+)",
                "(.)([0-9]+)",
                "([a-z0-9])([A-Z])"]),
    Snaked1 = string:replace(Snaked, ".", "_", all),
    Snaked2 = string:replace(Snaked1, "__", "_", all),
    string:to_lower(unicode:characters_to_list(Snaked2)).

needs_update(Source, Artifact) ->
    filelib:last_modified(Source) > filelib:last_modified(Artifact).

log_warnings(Warnings) ->
    [begin
         rebar_api:warn("Warning building ~s~n", [File]),
         [rebar_api:warn("        ~p: ~s", [Line, M:format_error(E)])
          || {Line, M, E} <- Errors]
     end || {File, Errors} <- Warnings].