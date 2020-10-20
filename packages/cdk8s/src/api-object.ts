import { Construct, IConstruct, Node } from 'constructs';
import { Chart } from './chart';
import { sanitizeValue } from './_util';
import { resolve } from './lazy';
import * as stringify from 'json-stable-stringify';
import { ApiObjectMetadata, Metadata } from './metadata';

/**
 * Options for defining API objects.
 */
export interface ApiObjectOptions {
  /**
   * Object metadata.
   *
   * If `name` is not specified, an app-unique name will be allocated by the
   * framework based on the path of the construct within thes construct tree.
   */
  readonly metadata?: ApiObjectMetadata;

  /**
   * API version.
   */
  readonly apiVersion: string;

  /**
   * Resource kind.
   */
  readonly kind: string;

  /**
   * Additional attributes for this API object.
   */
  readonly [key: string]: any;
}

export class ApiObject extends Construct {
  /**
   * The name of the API object.
   *
   * If a name is specified in `metadata.name` this will be the name returned.
   * Otherwise, a name will be generated by calling
   * `Chart.of(this).generatedObjectName(this)`, which by default uses the
   * construct path to generate a DNS-compatible name for the resource.
   */
  public readonly name: string;

  /**
   * The object's API version (e.g. `authorization.k8s.io/v1`)
   */
  public readonly apiVersion: string;

  /**
   * The group portion of the API version (e.g. `authorization.k8s.io`)
   */
  public readonly apiGroup: string;

  /**
   * The object kind.
   */
  public readonly kind: string;

  /**
   * The chart in which this object is defined.
   */
  public readonly chart: Chart;

  /**
   * Metadata associated with this API object.
   */
  public readonly metadata: Metadata;

  /**
   * Defines an API object.
   *
   * @param scope the construct scope
   * @param ns namespace
   * @param options options
   */
  constructor(scope: Construct, ns: string, private readonly options: ApiObjectOptions) {
    super(scope, ns);
    this.chart = Chart.of(this);
    this.kind = options.kind;
    this.apiVersion = options.apiVersion;
    this.apiGroup = parseApiGroup(this.apiVersion);

    this.name = options.metadata?.name ?? this.chart.generateObjectName(this);

    this.metadata = Metadata.of(this);
    
    for (const [k, v] of Object.entries(options.metadata?.labels ?? {})) {
      this.metadata.addLabel(k, v);
    }

    if (options.metadata?.labels) {
      this.metadata.addLabels(options.metadata?.labels);
    }

    if (options.metadata?.annotations) {
      this.metadata.addAnnotations(options.metadata?.annotations);
    }

    if (options.metadata?.namespace) {
      this.metadata.addNamespace(options.metadata.name);
    }
  }

  /**
   * Create a dependency between this ApiObject and other constructs.
   * These can be other ApiObjects, Charts, or custom.
   *
   * @param dependencies the dependencies to add.
   */
  public addDependency(...dependencies: IConstruct[]) {
    Node.of(this).addDependency(...dependencies);
  }

  /**
   * Renders the object to Kubernetes JSON.
   */
  public toJson(): any {
    const data = {
      // start by splatting the resource as-is
      ...this.options,

      // resolve metadata (which also includes the initialized resource metadata)
      metadata: {
        name: this.name,
        ...this.options.metadata,
        ...Metadata.resolve(this),
      },
    };

    // convert to "pure data" so, for example, when we convert to yaml these
    // references are not converted to anchors.
    return JSON.parse(stringify(sanitizeValue(resolve(data))));
  }
}

function parseApiGroup(apiVersion: string) {
  const v = apiVersion.split('/');

  // no group means "core"
  // https://kubernetes.io/docs/reference/using-api/api-overview/#api-groups
  if (v.length === 1) {
    return 'core';
  }

  if (v.length === 2) {
    return v[0];
  }

  throw new Error(`invalid apiVersion ${apiVersion}, expecting GROUP/VERSION. See https://kubernetes.io/docs/reference/using-api/api-overview/#api-groups`);
}